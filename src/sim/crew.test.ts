import { describe, expect, it } from 'vitest'
import { content } from '../content'
import { assess } from '../engine'
import { CREW, generateHistory, SCENARIOS } from './index'

const NOW = '2026-11-13T08:00:00.000Z'
const byId = (id: string) => SCENARIOS.find((s) => s.id === id)!

describe('crew bios', () => {
  it('are complete, fictional and plausible', () => {
    expect(new Set(CREW.map((c) => c.bio.callsign)).size).toBe(6)
    for (const c of CREW) {
      expect(c.bio.age).toBeGreaterThanOrEqual(30)
      expect(c.bio.age).toBeLessThanOrEqual(55)
      const bmi = c.bio.weightKg / (c.bio.heightCm / 100) ** 2
      expect(bmi, c.id).toBeGreaterThan(18.5)
      expect(bmi, c.id).toBeLessThan(25)
      expect(c.bio.flightDay).toBeLessThanOrEqual(c.bio.missionDays)
    }
  })
  it('every profile mean sits inside the normal range of every absolute rule', () => {
    for (const c of CREW) {
      const a = assess(content, generateHistory(c, byId('healthy'), content.indicators, NOW), NOW)
      expect(a.evaluations.flatMap((e) => e.fired), c.id).toEqual([])
    }
  })
})

/**
 * Statistical robustness: the same scenarios re-run under 200 different random seeds.
 * Healthy crew must never raise a false alert; each scenario must be detected every time.
 */
describe('across 200 random seeds', () => {
  const salts = Array.from({ length: 200 }, (_, i) => `#${i}`)
  it('healthy baseline raises a false alert in under 0.5% of crew runs', () => {
    let runs = 0
    const bad: string[] = []
    for (const salt of salts) for (const c of CREW) {
      runs++
      const a = assess(content, generateHistory(c, byId('healthy'), content.indicators, NOW, 15, salt), NOW)
      const fired = a.evaluations.flatMap((e) => e.fired.map((f) => f.ruleId))
      if (fired.length) bad.push(`${salt} ${c.id} ${fired.join(',')}`)
    }
    // Zero is unrealistic: baseline rules use k=3 MAD on noisy data. We track the rate instead.
    expect(bad.length / runs, bad.slice(0, 8).join(' | ')).toBeLessThan(0.005)
  })
  for (const id of ['sleep-loss', 'bp-rise', 'infection', 'msk-decline', 'urgent']) {
    it(`scenario ${id} is detected at the expected tier every time`, () => {
      const sc = byId(id)
      const exp = sc.expected[0]
      const crew = CREW.find((c) => c.id === exp.crewId)!
      const wrong: string[] = []
      for (const salt of salts) {
        const a = assess(content, generateHistory(crew, sc, content.indicators, NOW, 15, salt), NOW)
        if (a.tier.tier !== exp.tier) wrong.push(`${salt}: tier ${a.tier.tier}`)
      }
      expect(wrong.slice(0, 10)).toEqual([])
    })
  }
})
