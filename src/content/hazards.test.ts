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
      if (r.coverage === 'monitored') expect(r.indicatorIds.length).toBeGreaterThan(0)
      if (r.coverage === 'not-monitored') expect(r.indicatorIds).toEqual([])
    }
  })
  it('every Asteron indicator maps to at least one NASA risk', () => {
    const mapped = new Set(hz.risks.flatMap((r) => r.indicatorIds))
    expect(content.indicators.filter((i) => !mapped.has(i.id)).map((i) => i.id)).toEqual([])
  })
})
