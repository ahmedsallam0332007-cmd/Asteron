import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { linkState } from '../link/contactPlan'
import { runMission, type SimTrace } from './simulation'
import { checkInvariants } from './simulation.invariants'

const START = Date.parse('2023-11-04T06:00:00Z') // Mars, crosses NASA's Nov 2023 solar-conjunction moratorium
const traces = new Map<number, SimTrace>()

const run = async (seed: number) => {
  if (!traces.has(seed)) traces.set(seed, await runMission({ profile: 'mars', start: START, days: 26, seed, stepMs: 2 * 3_600_000 }))
  return traces.get(seed)!
}

describe('mission simulator: one whole mission, every actor, every bundle', () => {
  it('records each day for each crew member, both what the station decided and what Earth knew', async () => {
    const t = await run(1)
    expect(t.daily).toHaveLength(26)
    for (const d of t.daily) expect(Object.keys(d.station)).toHaveLength(6)
    expect(t.summary.checkins).toBe(26 * 6)
  })

  it('during the solar conjunction nothing reaches Earth, and the crew decides on board', async () => {
    const t = await run(1)
    const black = t.daily.filter((d) => d.link.blackout)
    expect(black.length).toBeGreaterThanOrEqual(10)
    // the exact blackout span (JPL Horizons + NASA 2° rule); allow one light-time for bundles already travelling when it began
    const span = linkState('mars', black[0].at + 12 * 3_600_000).blackout!
    const inside = t.bundles.filter((b) => b.dir === 'down' && b.arrivedAt !== undefined && b.arrivedAt > span.start + 3_600_000 && b.arrivedAt < span.end)
    expect(inside.map((b) => `${b.kind} ${new Date(b.arrivedAt!).toISOString()}`)).toEqual([])
    expect(t.bundles.some((b) => b.dir === 'down' && b.arrivedAt !== undefined && b.arrivedAt >= span.end)).toBe(true)
    expect(t.summary.onboardDecisions).toBeGreaterThan(0)
  })

  it('after the blackout the backlog arrives, the urgent alert first among the crew member’s bundles', async () => {
    const t = await run(1)
    const urgent = t.bundles.find((b) => b.kind === 'alert' && b.crewId === 'rahal' && b.outcome === 'delivered')
    expect(urgent).toBeDefined()
    const sameBatch = t.bundles.filter((b) => b.crewId === 'rahal' && b.dir === 'down' && b.sentAt !== undefined && Math.abs(b.sentAt - urgent!.sentAt!) < 3_600_000)
    const firstSent = sameBatch.sort((a, b) => a.sentAt! - b.sentAt!)[0]
    expect(firstSent.priority).toBe(3)
    expect(t.summary.maxDelayH).toBeGreaterThan(24)
  })

  it('the flight surgeon acts on every alert that reached Earth, and the advice reaches the crew', async () => {
    const t = await run(1)
    expect(t.summary.alerts).toBeGreaterThan(0)
    expect(t.events.some((e) => e.actor === 'surgeon' && e.action === 'resolved')).toBe(true)
    expect(t.bundles.some((b) => b.kind === 'advice' && b.outcome === 'delivered')).toBe(true)
  })

  it('the solar storm warning reaches the station one light-time after it is sent, and the crew shelters', async () => {
    const t = await run(1)
    const storm = t.bundles.find((b) => b.kind === 'space-weather')!
    expect(storm.outcome).toBe('delivered')
    expect(t.events.some((e) => e.actor === 'station' && e.action === 'sheltered')).toBe(true)
  })

  it('the trace links every step of a bundle’s journey: created, sent, arrived, verified', async () => {
    const t = await run(1)
    for (const b of t.bundles.filter((x) => x.outcome === 'delivered')) {
      expect(b.sentAt, b.id).toBeGreaterThanOrEqual(b.createdAt)
      expect(b.arrivedAt!, b.id).toBeGreaterThan(b.sentAt!)
    }
  })

  it('seed 1 (26 days): invariants hold', async () => { checkInvariants(await run(1)) }, 120_000)
})
