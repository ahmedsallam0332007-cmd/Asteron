import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { content } from '../content'
import { GroundDB, StationDB } from '../data/db'
import { seedScenario } from '../data/seed'
import { provisionPair } from '../link/keys'
import { oneWaySeconds } from '../link/contactPlan'
import { GroundNode } from '../ground/node'
import { StationNode } from '../station/node'
import { clockAt, rebase, type ClockState } from './clock'
import { BroadcastTransport, LoopbackTransport, type Envelope } from './transport'
import { Mission } from './mission'

const MANUAL = { kind: 'manual', enteredBy: 'crew' } as const
const HEALTHY = { hr_rest: 66, bp_sys: 112, bp_dia: 72, spo2: 98, temp: 36.7, sleep_h: 7.7, mood: 4, exercise_min: 95, stress: 2, workload: 3, sym_headache: 0, sym_rash: 0, sym_dizzy: 0, sym_vision: 0 }
const URGENT = { ...HEALTHY, temp: 38.6, hr_rest: 112, spo2: 91 }
let n = 0

describe('mission clock: time compression is explicit and never runs backwards', () => {
  const c: ClockState = { missionAt: 1000, realAt: 0, compression: 60 }
  it('maps real time to mission time with the compression factor', () => {
    expect(clockAt(c, 1000)).toBe(1000 + 60_000)
  })
  it('changing compression keeps mission time continuous', () => {
    const c2 = rebase(c, 2000, { compression: 1 })
    expect(clockAt(c2, 2000)).toBe(clockAt(c, 2000))
    expect(clockAt(c2, 3000)).toBe(clockAt(c, 2000) + 1000)
  })
  it('jumping forward is allowed, backwards is refused', () => {
    expect(clockAt(rebase(c, 0, { jumpTo: 5000 }), 0)).toBe(5000)
    expect(() => rebase(c, 0, { jumpTo: 10 })).toThrow(/backwards/)
  })
  it('rejects a compression below 1 or not finite', () => {
    expect(() => rebase(c, 0, { compression: 0 })).toThrow()
    expect(() => rebase(c, 0, { compression: Infinity })).toThrow()
  })
})

describe('transports: a bundle is only handed over once its arrival time has passed', () => {
  const env = (arrivesAt: number, id = 'x'): Envelope => ({ dir: 'down', arrivesAt, sealed: { header: { id }, iv: '', ct: '', sig: '' } as never })
  it('loopback holds bundles in flight until they arrive', () => {
    const t = new LoopbackTransport()
    t.post(env(100, 'a'))
    t.post(env(50, 'b'))
    expect(t.due('down', 49)).toEqual([])
    expect(t.due('down', 100).map((e) => (e.sealed.header as { id: string }).id)).toEqual(['b', 'a'])
    expect(t.due('down', 1000)).toEqual([])
    expect(t.inFlight('down')).toBe(0)
  })
  it('directions are separate', () => {
    const t = new LoopbackTransport()
    t.post(env(1))
    expect(t.due('up', 10)).toEqual([])
    expect(t.due('down', 10)).toHaveLength(1)
  })
  it('BroadcastChannel carries envelopes between two windows of the same browser', async () => {
    const name = `asteron-test-${Math.random()}`
    const a = new BroadcastTransport(name)
    const b = new BroadcastTransport(name)
    a.post(env(10, 'over-the-channel'))
    await new Promise((r) => setTimeout(r, 30))
    expect(b.due('down', 10).map((e) => (e.sealed.header as { id: string }).id)).toEqual(['over-the-channel'])
    expect(a.due('down', 10)).toEqual([]) // a sender does not receive its own posts
    a.close(); b.close()
  })
  it('BroadcastChannel ignores messages that are not envelopes', async () => {
    const name = `asteron-test-${Math.random()}`
    const b = new BroadcastTransport(name)
    const raw = new BroadcastChannel(name)
    raw.postMessage({ hello: 'world' })
    raw.postMessage({ dir: 'down', arrivesAt: 'soon', sealed: {} })
    await new Promise((r) => setTimeout(r, 30))
    expect(b.due('down', Number.MAX_SAFE_INTEGER)).toEqual([])
    b.close(); raw.close()
  })
})

async function makeMission(profile: 'iss' | 'mars', start: number) {
  const sdb = new StationDB(`st-${++n}-${Math.random()}`)
  const gdb = new GroundDB(`gr-${n}-${Math.random()}`)
  await seedScenario(sdb, 'healthy', new Date(start).toISOString())
  const keys = await provisionPair()
  let prof: 'iss' | 'mars' = profile
  const station = new StationNode({ db: sdb, keys: keys.station, content, profile: () => prof })
  const ground = new GroundNode({ db: gdb, keys: keys.ground, content })
  const transport = new LoopbackTransport()
  const mission = new Mission({ station, ground, transport, profile: () => prof, start })
  await mission.init()
  return { sdb, gdb, station, ground, transport, mission, setProfile: (p: 'iss' | 'mars') => (prof = p) }
}

describe('mission runtime: both sides, one link', () => {
  it('ISS: a check-in reaches the ground within a second and custody is released by the ack', async () => {
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const { station, mission, gdb, sdb } = await makeMission('iss', t0)
    await station.submitCheckIn({ crewId: 'rahal', values: HEALTHY, provenance: () => MANUAL, now: t0 })
    await mission.tick(t0 + 1000)
    expect(await gdb.crewState.get('rahal')).toMatchObject({ overall: 'normal' })
    await mission.tick(t0 + 2000)
    expect((await sdb.outbox.toArray()).filter((r) => r.kind !== 'ack').every((r) => r.state === 'acked')).toBe(true)
  })

  it('Mars: a bundle arrives exactly one JPL Horizons light-time after it is sent, not before', async () => {
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const { station, mission, gdb } = await makeMission('mars', t0)
    await station.submitCheckIn({ crewId: 'rahal', values: HEALTHY, provenance: () => MANUAL, now: t0 })
    const owlt = oneWaySeconds('mars', t0).sec * 1000
    await mission.tick(t0 + owlt - 5_000)
    expect(await gdb.crewState.get('rahal')).toBeUndefined()
    await mission.tick(t0 + owlt + 5_000)
    expect(await gdb.crewState.get('rahal')).toMatchObject({ dataCreatedAt: t0 })
  })

  it('link cut: the queue grows on the station and nothing reaches the ground; after restore the urgent alert lands first', async () => {
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const { station, mission, gdb, ground } = await makeMission('iss', t0)
    mission.setCut(true)
    await station.submitCheckIn({ crewId: 'okafor', values: HEALTHY, provenance: () => MANUAL, now: t0 })
    await station.submitCheckIn({ crewId: 'rahal', values: URGENT, provenance: () => MANUAL, now: t0 + 1000 })
    await mission.tick(t0 + 60_000)
    expect(await gdb.inbox.count()).toBe(0)
    expect((await station.queue()).length).toBe(4)
    mission.setCut(false)
    const delivered = await mission.tick(t0 + 61_000)
    expect(delivered.down[0]).toMatchObject({ kind: 'alert', ok: true })
    expect(await gdb.inbox.count()).toBe(4)
    expect((await ground.crewOverview(t0 + 61_000)).find((c) => c.crewId === 'rahal')).toMatchObject({ shownStatus: 'urgent', openAlerts: expect.any(Number) })
  })

  it('a bundle lost in transit is sent again after the custody timeout and stored once on the ground', async () => {
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const { station, mission, gdb, transport } = await makeMission('iss', t0)
    await station.submitCheckIn({ crewId: 'rahal', values: HEALTHY, provenance: () => MANUAL, now: t0 })
    transport.dropNext('down', 1)
    await mission.tick(t0 + 1000)
    expect(await gdb.inbox.count()).toBe(0)
    await mission.tick(t0 + 1000 + mission.custodyTimeoutMs(t0) + 1000)
    await mission.tick(t0 + 1000 + mission.custodyTimeoutMs(t0) + 2000)
    expect(await gdb.inbox.count()).toBe(1)
  })

  it('in-flight bundles still arrive after a cut (they are already travelling at the speed of light)', async () => {
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const { station, mission, gdb } = await makeMission('mars', t0)
    await station.submitCheckIn({ crewId: 'rahal', values: HEALTHY, provenance: () => MANUAL, now: t0 })
    await mission.tick(t0 + 1000)
    mission.setCut(true)
    await mission.tick(t0 + oneWaySeconds('mars', t0).sec * 1000 + 5000)
    expect(await gdb.inbox.count()).toBe(1)
  })

  it('the flight surgeon\'s advice travels up and the crew sees it', async () => {
    const t0 = Date.parse('2026-11-13T14:30:00Z')
    const { mission, ground, sdb } = await makeMission('iss', t0)
    await ground.sendAdvice('rahal', 'Rest and hydrate.', t0)
    await mission.tick(t0 + 1000)
    expect((await sdb.inbox.toArray()).map((r) => r.kind)).toEqual(['advice'])
  })
})
