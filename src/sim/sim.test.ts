import { describe, expect, it } from 'vitest'
import { content } from '../content'
import { assess } from '../engine'
import { CREW, generateHistory, SCENARIOS } from './index'
import type { Scenario } from './index'

const NOW = '2026-11-13T08:00:00.000Z'

describe('simulator', () => {
  it('has 6 crew and 7 scenarios', () => {
    expect(CREW).toHaveLength(6)
    expect(SCENARIOS.map((s) => s.id)).toEqual(['healthy', 'sleep-loss', 'bp-rise', 'infection', 'msk-decline', 'urgent', 'outage'])
  })
  it('is deterministic', () => {
    const a = generateHistory(CREW[0], SCENARIOS[0], content.indicators, NOW)
    const b = generateHistory(CREW[0], SCENARIOS[0], content.indicators, NOW)
    expect(a).toEqual(b)
  })
  it('stamps provenance on every reading', () => {
    const r = generateHistory(CREW[1], SCENARIOS[1], content.indicators, NOW)
    expect(r.every((x) => x.provenance?.kind === 'simulated')).toBe(true)
  })
  for (const sc of SCENARIOS) {
    describe(`scenario ${sc.id}`, () => {
      for (const crew of CREW) {
        const exp = sc.expected.find((e) => e.crewId === crew.id) ?? sc.expected.find((e) => e.crewId === '*') ?? ({ crewId: crew.id, overall: 'normal', tier: 1 } as Scenario['expected'][number])
        it(`${crew.id}: ${JSON.stringify(exp)}`, () => {
          const a = assess(content, generateHistory(crew, sc, content.indicators, NOW), NOW)
          if (exp.overall) expect(a.overall.status).toBe(exp.overall)
          if (exp.tier) expect(a.tier.tier).toBe(exp.tier)
          for (const [sys, st] of Object.entries(exp.systems ?? {})) expect(a.systems.find((s) => s.systemId === sys)?.status).toBe(st)
          if (!sc.expected.some((e) => e.crewId === crew.id)) {
            const fired = a.evaluations.flatMap((e) => e.fired.map((f) => `${e.indicatorId}:${f.ruleId}`))
            expect(fired).toEqual([])
          }
        })
      }
    })
  }
})
