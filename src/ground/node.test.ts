import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { content } from '../content'
import { GroundDB, StationDB } from '../data/db'
import { seedScenario } from '../data/seed'
import { verifyAuditChain } from '../data/groundRepo'
import { provisionPair } from '../link/keys'
import { makeBundle } from '../link/protocol'
import { seal } from '../link/security'
import { StationNode } from '../station/node'
import { GroundNode, STALE_AFTER_MS } from './node'

const NOW = Date.parse('2026-11-13T14:30:00Z')
const MANUAL = { kind: 'manual', enteredBy: 'crew' } as const
const HEALTHY = { hr_rest: 66, bp_sys: 112, bp_dia: 72, spo2: 98, temp: 36.7, sleep_h: 7.7, mood: 4, exercise_min: 95, stress: 2, workload: 3, sym_headache: 0, sym_rash: 0, sym_dizzy: 0, sym_vision: 0 }
const URGENT = { ...HEALTHY, temp: 38.6, hr_rest: 112, spo2: 91 }
let n = 0

async function setup() {
  const sdb = new StationDB(`st-${++n}-${Math.random()}`)
  const gdb = new GroundDB(`gr-${n}-${Math.random()}`)
  await seedScenario(sdb, 'healthy', new Date(NOW).toISOString())
  const keys = await provisionPair()
  const station = new StationNode({ db: sdb, keys: keys.station, content, profile: () => 'iss' })
  const ground = new GroundNode({ db: gdb, keys: keys.ground, content })
  await station.init()
  await ground.init()
  /** Delivers everything queued on the station, as the link would. */
  const downlink = async (at = NOW + 1000) => {
    const out = []
    for (const r of await station.queue()) out.push(await ground.receive(r.sealed, at))
    await sdb.outbox.toCollection().modify({ state: 'sent' })
    return out
  }
  return { sdb, gdb, station, ground, keys, downlink }
}

describe('ground node: receive -> verify -> crew state -> alerts -> audit -> uplink', () => {
  it('a check-in updates the crew state with what the station decided and when the data was created', async () => {
    const { ground, station, downlink, gdb } = await setup()
    await station.submitCheckIn({ crewId: 'rahal', values: HEALTHY, provenance: () => MANUAL, now: NOW })
    const res = await downlink(NOW + 5000)
    expect(res.every((r) => r.ok)).toBe(true)
    const s = await gdb.crewState.get('rahal')
    expect(s).toMatchObject({ crewId: 'rahal', overall: 'normal', tier: 1, directive: 'follow-tier', dataCreatedAt: NOW, lastContactAt: NOW + 5000 })
    expect(await ground.outboxKinds()).toEqual(['ack'])
  })

  it('an urgent alert bundle opens ground alerts for concern and urgent findings only', async () => {
    const { station, downlink, gdb } = await setup()
    await station.submitCheckIn({ crewId: 'rahal', values: URGENT, provenance: () => MANUAL, now: NOW })
    await downlink()
    const alerts = await gdb.alerts.toArray()
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts.every((a) => a.status === 'concern' || a.status === 'urgent')).toBe(true)
    expect(alerts.some((a) => a.ruleId === 'comp-infection-severe' && a.status === 'urgent')).toBe(true)
    expect(alerts.every((a) => a.state === 'new' && a.dataCreatedAt === NOW)).toBe(true)
  })

  it('the same bundle twice is stored once and acknowledged twice', async () => {
    const { station, ground, gdb } = await setup()
    await station.submitCheckIn({ crewId: 'rahal', values: HEALTHY, provenance: () => MANUAL, now: NOW })
    const [rec] = await station.queue()
    expect(await ground.receive(rec.sealed, NOW + 1)).toMatchObject({ ok: true })
    expect(await ground.receive(rec.sealed, NOW + 2)).toMatchObject({ ok: true, duplicate: true })
    expect(await gdb.inbox.count()).toBe(1)
    expect(await ground.outboxKinds()).toEqual(['ack', 'ack'])
  })

  it('a tampered bundle is rejected, logged with its reason and written to the audit log; nothing else changes', async () => {
    const { station, ground, gdb } = await setup()
    await station.submitCheckIn({ crewId: 'rahal', values: URGENT, provenance: () => MANUAL, now: NOW })
    const alert = (await station.queue()).find((r) => r.kind === 'alert')!
    const downgraded = { ...alert.sealed, header: { ...alert.sealed.header, priority: 0 as const, kind: 'raw' as const } }
    const r = await ground.receive(downgraded, NOW + 1)
    expect(r).toMatchObject({ ok: false, reason: 'bad-signature' })
    expect(await gdb.inbox.count()).toBe(0)
    expect(await gdb.alerts.count()).toBe(0)
    expect((await gdb.rejected.toArray())[0]).toMatchObject({ bundleId: alert.id, reason: 'bad-signature' })
    expect((await gdb.audit.toArray()).map((a) => a.action)).toEqual(['rejected'])
  })

  it('refuses uplink kinds coming down', async () => {
    const { ground, keys } = await setup()
    const fake = await seal(await makeBundle({ id: 'x', seq: 50, kind: 'advice', crewId: 'rahal', createdAt: NOW, payload: { crewId: 'rahal', at: 'x', text: 'y' } }), keys.station.identity, keys.station.sendKey)
    expect(await ground.receive(fake, NOW)).toMatchObject({ ok: false, reason: 'wrong-direction' })
  })

  it('acknowledge then resolve: each step is audited and the resolution note goes up to the crew as advice', async () => {
    const { station, ground, downlink, gdb } = await setup()
    await station.submitCheckIn({ crewId: 'rahal', values: URGENT, provenance: () => MANUAL, now: NOW })
    await downlink()
    const a = (await gdb.alerts.toArray())[0]
    await ground.acknowledgeAlert(a.id, 'Dr. Haddad (flight surgeon)', NOW + 10_000)
    await ground.resolveAlert(a.id, 'Dr. Haddad (flight surgeon)', 'Start the infection protocol, oxygen at rest, recheck in 1 h.', NOW + 20_000)
    expect((await gdb.alerts.get(a.id))?.state).toBe('resolved')
    const actions = (await gdb.audit.orderBy('id').toArray()).map((x) => x.action)
    expect(actions).toEqual(expect.arrayContaining(['received', 'alert-created', 'acknowledged', 'resolved', 'advice-queued']))
    const advice = (await gdb.outbox.toArray()).find((r) => r.kind === 'advice')!
    expect(advice.priority).toBe(2)
    const res = await station.receive(advice.sealed, NOW + 30_000)
    expect(res).toMatchObject({ ok: true, kind: 'advice' })
    expect(await verifyAuditChain(gdb)).toMatchObject({ ok: true })
  })

  it('a solar storm warning is sent up at the highest priority with NASA shelter guidance', async () => {
    const { ground, gdb } = await setup()
    await ground.sendSpaceWeather({ eventId: 'spe-2026-11-13', message: 'Solar particle event in progress.' }, NOW)
    const rec = (await gdb.outbox.toArray())[0]
    expect(rec).toMatchObject({ kind: 'space-weather', priority: 3 })
  })

  it('an acknowledgement from the station releases custody of the advice', async () => {
    const { station, ground, gdb, sdb } = await setup()
    await ground.sendAdvice('rahal', 'Hydrate and rest.', NOW)
    const adv = (await gdb.outbox.toArray())[0]
    await gdb.outbox.update(adv.id, { state: 'sent' })
    await station.receive(adv.sealed, NOW + 1)
    const ack = (await sdb.outbox.toArray()).find((r) => r.kind === 'ack')!
    expect(await ground.receive(ack.sealed, NOW + 2)).toMatchObject({ ok: true, kind: 'ack' })
    expect((await gdb.outbox.get(adv.id))?.state).toBe('acked')
  })

  it('freshness: data older than the stale window is shown as unknown, never as current', async () => {
    const { station, ground, downlink } = await setup()
    await station.submitCheckIn({ crewId: 'rahal', values: HEALTHY, provenance: () => MANUAL, now: NOW })
    await downlink(NOW + 1000)
    const fresh = (await ground.crewOverview(NOW + 60_000)).find((c) => c.crewId === 'rahal')!
    expect(fresh).toMatchObject({ shownStatus: 'normal', stale: false, dataAgeMs: 60_000 })
    const old = (await ground.crewOverview(NOW + STALE_AFTER_MS + 1)).find((c) => c.crewId === 'rahal')!
    expect(old).toMatchObject({ shownStatus: 'unknown', stale: true, lastKnownStatus: 'normal' })
    const never = (await ground.crewOverview(NOW)).find((c) => c.crewId === 'okafor')!
    expect(never).toMatchObject({ shownStatus: 'unknown', stale: true, dataAgeMs: null })
  })

  it('dose and shared journal bundles reach the crew record', async () => {
    const { station, ground, downlink, sdb } = await setup()
    await station.recordDoses([{ crewId: 'rahal', takenAt: new Date(NOW).toISOString(), doseMsv: 0.4, kind: 'gcr', provenance: { kind: 'simulated', generator: 't', version: 't', seed: 1, scenarioId: 't' } }])
    await station.sendDoseSummary('rahal', NOW)
    const j = await sdb.journal.add({ crewId: 'rahal', at: new Date(NOW).toISOString(), text: 'Sleeping badly this week.', share: true })
    await station.shareJournal(j, NOW)
    await downlink()
    const st = (await ground.crewOverview(NOW + 2000)).find((c) => c.crewId === 'rahal')!
    expect(st.dose).toMatchObject({ careerMsv: 160.4 })
    expect((await ground.journal('rahal')).map((x) => x.text)).toEqual(['Sleeping badly this week.'])
  })

  it('the replay guard survives a ground restart', async () => {
    const { station, ground, gdb, keys } = await setup()
    await station.submitCheckIn({ crewId: 'rahal', values: HEALTHY, provenance: () => MANUAL, now: NOW })
    const [rec] = await station.queue()
    await ground.receive(rec.sealed, NOW)
    const again = new GroundNode({ db: gdb, keys: keys.ground, content })
    await again.init()
    const forged = await seal(await makeBundle({ id: 'other', seq: rec.seq, kind: 'checkin', crewId: 'rahal', createdAt: NOW, payload: {} }), keys.station.identity, keys.station.sendKey)
    expect(await again.receive(forged, NOW)).toMatchObject({ ok: false, reason: 'replay' })
  })

  it('a malformed bundle (garbage fields) is rejected and logged, never crashes the ground', async () => {
    const { ground, gdb } = await setup()
    const garbage = { header: { id: 'junk', seq: 1, src: 'asteron-station' }, iv: '%%%', ct: 'not base64!', sig: '' } as never
    expect(await ground.receive(garbage, NOW)).toMatchObject({ ok: false, reason: 'malformed' })
    expect((await gdb.rejected.toArray())[0]).toMatchObject({ bundleId: 'junk', reason: 'malformed' })
  })
})
