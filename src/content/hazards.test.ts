import { describe, expect, it } from 'vitest'
import hz from './hazards.json'
import { content } from './index'

describe('NASA hazards and risks content', () => {
  it('has the 5 hazards and the 17 risks named on NASA HRP pages', () => {
    expect(hz.hazards.map((h) => h.name)).toEqual(['Space Radiation', 'Isolation and Confinement', 'Distance from Earth', 'Gravity Fields', 'Hostile/Closed Environments'])
    expect(hz.risks).toHaveLength(17)
  })
  it('every risk links to real hazards, real indicators and resolvable sources', () => {
    const hids = new Set(hz.hazards.map((h) => h.id))
    const iids = new Set(content.indicators.map((i) => i.id))
    const sids = new Set(content.sources.map((s) => s.id))
    for (const r of hz.risks) {
      expect(r.hazardIds.length).toBeGreaterThan(0)
      r.hazardIds.forEach((h) => expect(hids.has(h), h).toBe(true))
      r.indicatorIds.forEach((i) => expect(iids.has(i), i).toBe(true))
      r.sourceIds.forEach((s) => expect(sids.has(s), s).toBe(true))
      if (r.coverage === 'monitored') expect(r.indicatorIds.length + ((r as { features?: string[] }).features?.length ?? 0)).toBeGreaterThan(0)
      if (r.coverage === 'not-monitored') expect(r.indicatorIds).toEqual([])
    }
  })
  it('every Asteron indicator maps to at least one NASA risk', () => {
    const mapped = new Set(hz.risks.flatMap((r) => r.indicatorIds))
    expect(content.indicators.filter((i) => !mapped.has(i.id)).map((i) => i.id)).toEqual([])
  })
})

describe('risk coverage after the 13 Nov health analysis (honest, per NASA risk)', () => {
  const method = (name: string) => (hz.risks as { name: string; method?: string }[]).find((r) => r.name.includes(name))?.method
  it('records how each of the 17 risks is covered', () => {
    expect(hz.risks.map((r) => (r as { method?: string }).method)).toEqual([
      'self-report', 'self-report', 'direct', 'out-of-scope', 'context', 'direct', 'context', 'out-of-scope', 'direct',
      'self-report', 'context', 'direct', 'self-report', 'direct', 'core', 'out-of-scope', 'direct',
    ])
  })
  it('symptoms, stress and workload are mapped to the risks they serve', () => {
    const inds = (name: string) => hz.risks.find((r) => r.name.includes(name))!.indicatorIds
    expect(inds('Immune')).toEqual(expect.arrayContaining(['temp', 'sym_rash']))
    expect(inds('Sensorimotor')).toContain('sym_dizzy')
    expect(inds('Hypoxia')).toEqual(expect.arrayContaining(['spo2', 'sym_headache']))
    expect(inds('SANS')).toContain('sym_vision')
    expect(inds('Behavioral')).toEqual(expect.arrayContaining(['mood', 'stress']))
    expect(inds('Sleep')).toEqual(expect.arrayContaining(['sleep_h', 'workload']))
  })
  it('radiation and Earth-independent operations are covered by features, not indicators', () => {
    const feats = (name: string) => (hz.risks.find((r) => r.name.includes(name)) as { features?: string[] }).features
    expect(method('Radiation')).toBe('direct')
    expect(feats('Radiation')).toContain('radiation-dose-tracker')
    expect(feats('Systems Operations')).toEqual(expect.arrayContaining(['mission-link', 'link-aware-escalation', 'store-and-forward']))
  })
})
