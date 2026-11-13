import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { GroundDB, StationDB } from '../data/db'
import { PreflightDB } from '../link/pairing'
import { createSystemStore } from './system'

const T0 = Date.parse('2026-11-13T14:30:00Z')
const MANUAL = { kind: 'manual', enteredBy: 'crew' } as const
const URGENT = { hr_rest: 112, bp_sys: 112, bp_dia: 72, spo2: 91, temp: 38.6, sleep_h: 7.7, mood: 4, exercise_min: 95, stress: 2, workload: 3, sym_headache: 0, sym_rash: 0, sym_dizzy: 0, sym_vision: 0 }

function make() {
  const id = `${Date.now()}-${Math.random()}`
  let real = 0
  const store = createSystemStore({
    stationDb: new StationDB(`st-${id}`), groundDb: new GroundDB(`gr-${id}`), preflight: new PreflightDB(`pf-${id}`),
    clock: () => real, autoTick: false,
  })
  return { store, advanceReal: (ms: number) => (real += ms) }
}

describe('system store (what the pages use)', () => {
  it('boots to ready, and a reset starts the mission at the chosen date and profile', async () => {
    const { store } = make()
    expect(store.getState().status).toBe('idle')
    await store.getState().start({ epoch: T0, profile: 'iss', scenarioId: 'healthy' })
    const s = store.getState()
    expect(s.status).toBe('ready')
    expect(s.profile).toBe('iss')
    expect(s.missionNow).toBe(T0)
  })

  it('a tick moves mission time with the compression factor and records what crossed the link', async () => {
    const { store, advanceReal } = make()
    await store.getState().start({ epoch: T0, profile: 'iss', scenarioId: 'healthy' })
    store.getState().setCompression(60)
    advanceReal(1000)
    await store.getState().tick()
    expect(store.getState().missionNow).toBe(T0 + 60_000)
    expect(store.getState().events.some((e) => e.dir === 'down' && e.ok)).toBe(true)
    expect(store.getState().version).toBeGreaterThan(0)
  })

  it('cut and restore are reflected in state; while cut nothing new crosses', async () => {
    const { store } = make()
    await store.getState().start({ epoch: T0, profile: 'iss', scenarioId: 'healthy' })
    await store.getState().fastForward(5_000)
    store.getState().setCut(true)
    expect(store.getState().cut).toBe(true)
    await store.getState().system!.station.submitCheckIn({ crewId: 'rahal', values: URGENT, provenance: () => MANUAL, now: store.getState().missionNow })
    const before = store.getState().events.length
    await store.getState().fastForward(60_000)
    expect(store.getState().events.length).toBe(before)
    store.getState().setCut(false)
    await store.getState().fastForward(2_000)
    expect(store.getState().events.slice(before)[0]).toMatchObject({ dir: 'down', kind: 'alert', ok: true })
  })

  it('a tampered bundle shows up as a rejected event', async () => {
    const { store } = make()
    await store.getState().start({ epoch: T0, profile: 'iss', scenarioId: 'healthy' })
    await store.getState().fastForward(5_000)
    store.getState().tamperNext('down')
    const before = store.getState().events.length
    const hb = await store.getState().system!.station.heartbeat(store.getState().missionNow)
    await store.getState().fastForward(2_000)
    const fresh = store.getState().events.slice(before)
    expect(fresh.filter((e) => e.id === hb.id)).toEqual([expect.objectContaining({ dir: 'down', ok: false, reason: 'bad-signature' })])
  })

  it('switching profile changes the physics from that moment', async () => {
    const { store } = make()
    await store.getState().start({ epoch: T0, profile: 'iss', scenarioId: 'healthy' })
    store.getState().setProfile('mars')
    expect(store.getState().system!.profile()).toBe('mars')
  })

  it('keeps the event log bounded', async () => {
    const { store } = make()
    await store.getState().start({ epoch: T0, profile: 'iss', scenarioId: 'healthy' })
    for (let i = 0; i < 260; i++) store.getState().pushEvents([{ dir: 'down', id: `x${i}`, arrivesAt: i, ok: true }])
    expect(store.getState().events.length).toBe(200)
  })
})
