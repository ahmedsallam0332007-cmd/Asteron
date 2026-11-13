import { describe, expect, it } from 'vitest'
import { content } from '../../content'
import { CREW, SCENARIOS, generateHistory } from '../../sim'
import { assess } from '../index'
import { replay } from '../replay'

const NOW = '2026-11-13T08:00:00.000Z'
const DAY = 86_400_000

describe('mission replay (K1): re-runs the pure engine day by day', () => {
  const sc = SCENARIOS.find((s) => s.id === 'urgent')!
  const crew = CREW.find((c) => c.id === sc.expected[0].crewId)!
  const readings = generateHistory(crew, sc, content.indicators, NOW)
  const start = new Date(Date.parse(NOW) - 14 * DAY).toISOString()
  const frames = replay(content, readings, start, NOW)

  it('one frame per day from start to end, inclusive', () => {
    expect(frames).toHaveLength(15)
    expect(frames[0].at).toBe(start)
    expect(frames[14].at).toBe(NOW)
  })
  it('the last frame equals a direct assessment at the end time', () => {
    const a = assess(content, readings, NOW)
    expect(frames[14].tier).toBe(a.tier.tier)
    expect(frames[14].overall).toBe(a.overall.status)
  })
  it('a frame never uses readings from its future', () => {
    const cut = frames[7].at
    const past = readings.filter((r) => r.takenAt <= cut)
    expect(frames[7].tier).toBe(assess(content, past, cut).tier.tier)
  })
  it('the urgent scenario escalates over time: early frames below tier 4, the last at tier 4', () => {
    expect(frames[0].tier).toBeLessThan(4)
    expect(frames[14].tier).toBe(4)
  })
  it('lists the rules that fired at each frame', () => {
    expect(frames[14].fired.length).toBeGreaterThan(0)
  })
  it('rejects an end before the start', () => {
    expect(() => replay(content, readings, NOW, start)).toThrow()
  })
})
