import { describe, expect, it } from 'vitest'
import { content } from '../content'
import { assess } from '../engine'
import { CREW, generateHistory, SCENARIOS } from '../sim'
import { buildReport } from './report'

const NOW = '2026-11-13T08:00:00.000Z'
describe('report', () => {
  const crew = CREW.find((c) => c.id === 'rahal')!
  const sc = SCENARIOS.find((s) => s.id === 'urgent')!
  const readings = generateHistory(crew, sc, content.indicators, NOW)
  const a = assess(content, readings, NOW)
  const text = buildReport({ crew, now: NOW, readings, content, ...a })
  it('names the crew, tier and every fired rule with sources', () => {
    expect(text).toContain('Cmdr. Nadia Rahal')
    expect(text).toContain('Tier 4 - Urgent')
    expect(text).toContain('[comp-infection-severe]')
    expect(text).toContain('Pulse Oximetry Training Manual')
  })
  it('always carries the disclaimer and is deterministic', () => {
    expect(text).toContain('not a medical diagnosis')
    expect(buildReport({ crew, now: NOW, readings, content, ...a })).toBe(text)
  })
  it('marks provenance of readings', () => {
    expect(text).toContain('[simulated]')
  })
})
