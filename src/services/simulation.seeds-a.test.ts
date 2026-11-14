import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { runMission } from './simulation'
import { checkInvariants } from './simulation.invariants'

/** Repeated runs with different random seeds: different attack days, different sensor noise, same guarantees. */
describe('mission simulator, repeated with other seeds (12-day Mars missions into the Nov 2023 conjunction)', () => {
  for (const seed of [2, 3, 4, 5, 6]) {
    it(`seed ${seed}: invariants hold`, async () => {
      const t = await runMission({ profile: 'mars', start: Date.parse('2023-11-04T06:00:00Z'), days: 12, seed, stepMs: 2 * 3_600_000 })
      expect(t.summary.checkins).toBe(72)
      checkInvariants(t)
    }, 120_000)
  }
})
