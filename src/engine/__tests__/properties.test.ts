import { describe, expect, it } from 'vitest'
import { content } from '../../content'
import { assess, STATUS_RANK } from '../index'
import type { Reading, Status } from '../types'
import { mulberry32 } from '../../sim/prng'

const NOW = '2026-11-13T08:00:00.000Z'
const DAY = 86_400_000
const rank = (s: Status) => (s === 'unknown' ? -1 : STATUS_RANK[s])

function randomReadings(rand: () => number): Reading[] {
  const out: Reading[] = []
  for (const ind of content.indicators) {
    const n = 1 + Math.floor(rand() * 15)
    for (let d = 0; d < n; d++) {
      const [lo, hi] = ind.plausible
      out.push({ crewId: 'p', indicatorId: ind.id, value: Math.round((lo + rand() * (hi - lo)) * 10) / 10, takenAt: new Date(Date.parse(NOW) - (n - 1 - d) * DAY).toISOString() })
    }
  }
  return out
}

describe('engine properties (1000 random inputs)', () => {
  const rand = mulberry32(20261113)
  const cases = Array.from({ length: 1000 }, () => randomReadings(rand))

  it('is deterministic', () => {
    for (const r of cases.slice(0, 100)) expect(assess(content, r, NOW)).toEqual(assess(content, r, NOW))
  })
  it('does not depend on the order readings arrive in', () => {
    const r2 = mulberry32(7)
    for (const r of cases.slice(0, 200)) {
      const shuffled = [...r].sort(() => r2() - 0.5)
      expect(assess(content, shuffled, NOW)).toEqual(assess(content, r, NOW))
    }
  })
  it('does not mutate its input', () => {
    for (const r of cases.slice(0, 50)) {
      const copy = JSON.stringify(r)
      assess(content, r, NOW)
      expect(JSON.stringify(r)).toBe(copy)
    }
  })
  it('ignores readings from the future', () => {
    for (const r of cases.slice(0, 100)) {
      const future: Reading = { crewId: 'p', indicatorId: 'spo2', value: 50, takenAt: new Date(Date.parse(NOW) + DAY).toISOString() }
      expect(assess(content, [...r, future], NOW)).toEqual(assess(content, r, NOW))
    }
  })
  it('overall is never better than the worst system, and tier never below the status', () => {
    const minTier: Record<string, number> = { normal: 1, unknown: 1, watch: 2, concern: 3, urgent: 4 }
    for (const r of cases) {
      const a = assess(content, r, NOW)
      const worst = Math.max(...a.systems.map((s) => rank(s.status)))
      if (worst >= 1) expect(rank(a.overall.status)).toBe(worst)
      expect(a.tier.tier).toBeGreaterThanOrEqual(minTier[a.overall.status] ?? 1)
    }
  })
  it('a fired rule always carries a message, readings and resolvable sources', () => {
    const ids = new Set(content.sources.map((s) => s.id))
    for (const r of cases.slice(0, 300)) for (const e of assess(content, r, NOW).evaluations) for (const f of e.fired) {
      expect(f.reason.length).toBeGreaterThan(10)
      expect(f.readings.length).toBeGreaterThan(0)
      expect(f.sourceIds.every((s) => ids.has(s))).toBe(true)
    }
  })
  it('a worse absolute reading never gives a better status (monotonic)', () => {
    const dir: Record<string, 1 | -1> = { bp_sys: 1, bp_dia: 1, temp: 1, spo2: -1 }
    for (const [id, sign] of Object.entries(dir)) {
      const ind = content.indicators.find((i) => i.id === id)!
      let prev = -2
      for (let v = sign === 1 ? ind.plausible[0] : ind.plausible[1]; sign === 1 ? v <= ind.plausible[1] : v >= ind.plausible[0]; v += sign * ind.step) {
        const a = assess(content, [{ crewId: 'm', indicatorId: id, value: v, takenAt: NOW }], NOW)
        const s = rank(a.evaluations.find((e) => e.indicatorId === id)!.status)
        expect(s, `${id}=${v}`).toBeGreaterThanOrEqual(prev)
        prev = s
      }
    }
  })
  it('unknown is never reported as normal when there is no reading', () => {
    const a = assess(content, [], NOW)
    expect(a.evaluations.every((e) => e.status === 'unknown')).toBe(true)
    expect(a.overall.status).toBe('unknown')
  })
})

describe('every absolute rule is tested exactly at its boundary', () => {
  for (const rule of content.rules.filter((r) => r.type === 'absolute')) {
    if (rule.type !== 'absolute') continue
    const { op, value } = rule.params
    const ind = rule.indicatorIds[0]
    const inclusive = op === 'gte' || op === 'lte'
    const step = content.indicators.find((i) => i.id === ind)!.step
    const inside = op === 'gt' || op === 'gte' ? value + step : value - step
    const outside = op === 'gt' || op === 'gte' ? value - step : value + step
    const fires = (v: number) => assess(content, [{ crewId: 'b', indicatorId: ind, value: v, takenAt: NOW }], NOW).evaluations.flatMap((e) => e.fired).some((f) => f.ruleId === rule.id)
    it(`${rule.id} (${op} ${value})`, () => {
      expect(fires(value)).toBe(inclusive)
      expect(fires(inside)).toBe(true)
      expect(fires(outside)).toBe(false)
    })
  }
})
