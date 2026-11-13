import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { GroundDB, StationDB } from '../data/db'
import { verifyAuditChain } from '../data/groundRepo'
import { PreflightDB } from '../link/pairing'
import { linkState, oneWaySeconds } from '../link/contactPlan'
import { AsteronSystem } from './system'
import { BroadcastTransport } from './transport'

const MANUAL = { kind: 'manual', enteredBy: 'crew' } as const
const HEALTHY = { hr_rest: 66, bp_sys: 112, bp_dia: 72, spo2: 98, temp: 36.7, sleep_h: 7.7, mood: 4, exercise_min: 95, stress: 2, workload: 3, sym_headache: 0, sym_rash: 0, sym_dizzy: 0, sym_vision: 0 }
const URGENT = { ...HEALTHY, temp: 38.6, hr_rest: 112, spo2: 91 }
const H = 3_600_000
const uniq = () => `${Date.now()}-${Math.random()}`

async function boot(profile: 'iss' | 'mars', epoch: number) {
  const id = uniq()
  const sys = await AsteronSystem.boot({
    stationDb: new StationDB(`st-${id}`), groundDb: new GroundDB(`gr-${id}`), preflight: new PreflightDB(`pf-${id}`), profile, realNow: 0, epoch,
  })
  await sys.reset({ epoch, scenarioId: 'healthy', profile, realNow: 0 })
  return sys
}
/** Advances mission time in steps, as the browser loop would. */
async function runFor(sys: AsteronSystem, ms: number, step = 60_000) {
  const end = sys.missionNow() + ms
  while (sys.missionNow() < end) await sys.advanceMission(Math.min(step, end - sys.missionNow()))
}

describe('full mission loop (headless): everything the website will show, proven without a screen', () => {
  it('after a reset the ground learns yesterday\'s state of all six crew, honestly aged, plus their radiation dose', async () => {
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const sys = await boot('iss', t0)
    await runFor(sys, 10_000, 1000)
    const ov = await sys.ground.crewOverview(sys.missionNow())
    expect(ov).toHaveLength(6)
    for (const c of ov) {
      expect(c.dataAgeMs).toBeGreaterThanOrEqual(24 * H)
      expect(c.stale).toBe(false)
      expect(c.dose?.careerMsv).toBeGreaterThan(0)
    }
  })

  it('Mars in solar conjunction: urgent case -> on-board protocol now; nothing reaches Earth until the blackout ends; then the alert lands first; the surgeon answers; custody closes; audit intact', async () => {
    const t0 = Date.parse('2023-11-18T14:30:00Z')
    expect(linkState('mars', t0).blackout).not.toBeNull()
    const sys = await boot('mars', t0)

    const r = await sys.station.submitCheckIn({ crewId: 'rahal', values: URGENT, provenance: () => MANUAL, now: sys.missionNow() })
    expect(r.assessment.tier.tier).toBe(4)
    expect(r.link.directive).toBe('onboard-protocol')

    await runFor(sys, 3 * 24 * H, H)
    expect(await sys.groundDb.alerts.count()).toBe(0)
    expect((await sys.station.queue()).length).toBeGreaterThan(0)

    const blackout = linkState('mars', t0).blackout!
    await runFor(sys, blackout.end - sys.missionNow() + 24 * H, 10 * 60_000)
    const alerts = await sys.groundDb.alerts.toArray()
    expect(alerts.some((a) => a.ruleId === 'comp-infection-severe' && a.status === 'urgent')).toBe(true)
    const firstAlertRx = (await sys.groundDb.inbox.toArray()).filter((b) => b.crewId === 'rahal').sort((a, b) => a.receivedAt - b.receivedAt)[0]
    expect(firstAlertRx.kind).toBe('alert')

    const a = alerts.find((x) => x.ruleId === 'comp-infection-severe')!
    await sys.ground.acknowledgeAlert(a.id, 'Flight surgeon', sys.missionNow())
    await sys.ground.resolveAlert(a.id, 'Flight surgeon', 'Continue the infection protocol; report temperature every 4 h.', sys.missionNow())
    await runFor(sys, 24 * H, 10 * 60_000)
    expect((await sys.stationDb.inbox.toArray()).some((m) => m.kind === 'advice')).toBe(true)
    const groundOut = await sys.groundDb.outbox.toArray()
    expect(groundOut.find((x) => x.kind === 'advice')?.state).toBe('acked')
    const stationOut = await sys.stationDb.outbox.toArray()
    expect(stationOut.filter((x) => x.kind !== 'ack').every((x) => x.state === 'acked')).toBe(true)
    expect(await verifyAuditChain(sys.groundDb)).toMatchObject({ ok: true })
  })

  it('an attacker flips bits in transit: the ground rejects the bundle and logs it; the station resends after the custody timeout; the authentic copy is stored once', async () => {
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const sys = await boot('iss', t0)
    await runFor(sys, 5000, 1000)
    sys.transport.tamperNext('down', 1)
    await sys.station.submitCheckIn({ crewId: 'varga', values: HEALTHY, provenance: () => MANUAL, now: sys.missionNow() })
    await runFor(sys, 5000, 1000)
    const rejected = await sys.groundDb.rejected.toArray()
    expect(rejected).toHaveLength(1)
    expect(['bad-signature', 'malformed']).toContain(rejected[0].reason)
    await runFor(sys, sys.mission.custodyTimeoutMs(sys.missionNow()) + 120_000, 30_000)
    const vargaCheckins = (await sys.groundDb.inbox.toArray()).filter((b) => b.crewId === 'varga' && b.kind === 'checkin' && b.createdAt > t0)
    expect(vargaCheckins).toHaveLength(1)
    expect((await sys.groundDb.audit.toArray()).some((x) => x.action === 'rejected')).toBe(true)
  })

  it('solar storm: the warning travels up at light speed; on Mars it lands one light-time later and the crew shelters', async () => {
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const sys = await boot('mars', t0)
    const sent = sys.missionNow()
    await sys.ground.sendSpaceWeather({ eventId: 'spe-demo', message: 'Solar particle event detected.' }, sent)
    await runFor(sys, oneWaySeconds('mars', sent).sec * 1000 - 30_000, 10_000)
    expect(await sys.station.shelter()).toBeUndefined()
    await runFor(sys, 60_000, 10_000)
    const sh = await sys.station.shelter()
    expect(sh?.eventId).toBe('spe-demo')
    expect(sh!.receivedAt - sent).toBeGreaterThanOrEqual(oneWaySeconds('mars', sent).sec * 1000)
  })

  it('cut and restore the link by hand (the judges\' button)', async () => {
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const sys = await boot('iss', t0)
    await runFor(sys, 5000, 1000)
    const before = await sys.groundDb.inbox.count()
    sys.setCut(true)
    await sys.station.submitCheckIn({ crewId: 'haddad', values: URGENT, provenance: () => MANUAL, now: sys.missionNow() })
    await runFor(sys, 60_000, 5000)
    expect(await sys.groundDb.inbox.count()).toBe(before)
    sys.setCut(false)
    await runFor(sys, 5000, 1000)
    expect(await sys.groundDb.inbox.count()).toBe(before + 3)
  })

  it('daily handover report and heatmap come out of the live ground state', async () => {
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const sys = await boot('iss', t0)
    await sys.station.submitCheckIn({ crewId: 'rahal', values: URGENT, provenance: () => MANUAL, now: sys.missionNow() })
    await runFor(sys, 10_000, 1000)
    const h = await sys.handover()
    expect(h.text).toMatch(/Cmdr\. Nadia Rahal: URGENT/)
    expect(h.openAlerts.length).toBeGreaterThan(0)
    expect(h.text).toMatch(/Audit chain: intact/)
    expect(await sys.groundDb.reports.count()).toBe(1)
  })

  it('the mission clock compresses time on request and never runs backwards', async () => {
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const sys = await boot('iss', t0)
    sys.setCompression(60, 0)
    expect(sys.missionNow(1000)).toBe(t0 + 60_000)
    expect(() => sys.jumpTo(t0 - 1, 1000)).toThrow(/backwards/)
  })
})

describe('two windows: station and ground in separate pages over BroadcastChannel (zero network)', () => {
  it('a check-in typed in the station window shows up in the ground window', async () => {
    const id = uniq()
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const pf = new PreflightDB(`pf-${id}`)
    const channel = `asteron-test-${id}`
    const stationWin = await AsteronSystem.boot({ role: 'station', stationDb: new StationDB(`st-${id}`), preflight: pf, profile: 'iss', realNow: 0, epoch: t0, transport: new BroadcastTransport(channel) })
    const groundWin = await AsteronSystem.boot({ role: 'ground', groundDb: new GroundDB(`gr-${id}`), preflight: pf, profile: 'iss', realNow: 0, epoch: t0, transport: new BroadcastTransport(channel) })
    await stationWin.ready()
    await groundWin.ready()
    await stationWin.station.submitCheckIn({ crewId: 'sorokina', values: HEALTHY, provenance: () => MANUAL, now: t0 })
    await stationWin.advanceMission(1000)
    await new Promise((r) => setTimeout(r, 50))
    await groundWin.advanceMission(1000)
    expect(await groundWin.groundDb.crewState.get('sorokina')).toMatchObject({ overall: 'normal' })
    expect(() => stationWin.ground).toThrow(/station window/)
    stationWin.close(); groundWin.close()
  })
})
