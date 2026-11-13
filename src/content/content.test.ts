import { describe, expect, it } from 'vitest'
import { content } from './index'

const ids = new Set(content.sources.map((s) => s.id))

describe('content', () => {
  it('parses with Zod', () => {
    expect(content.indicators.length).toBeGreaterThan(5)
    expect(content.rules.length).toBeGreaterThan(10)
  })
  it('every rule, indicator and tier has resolvable sourceIds', () => {
    const items = [...content.rules, ...content.indicators, ...content.tiers, ...content.guidance, ...content.anchors]
    const bad = items.flatMap((x) => x.sourceIds.filter((s) => !ids.has(s)).map((s) => `${'id' in x ? x.id : 'tier'} -> ${s}`))
    expect(bad).toEqual([])
  })
  it('every threshold rule cites a published source (baseline and trend rules are personal-change rules with engineering parameters)', () => {
    const designOnly = content.rules.filter((r) =>
      r.type !== 'baseline' && r.type !== 'trend' && r.sourceIds.every((s) => content.sources.find((x) => x.id === s)?.kind === 'design'),
    )
    expect(designOnly.map((r) => r.id)).toEqual([])
  })
  it('rule indicators and composite conditions exist', () => {
    const ind = new Set(content.indicators.map((i) => i.id))
    for (const r of content.rules) {
      for (const i of r.indicatorIds) expect(ind.has(i), `${r.id}: ${i}`).toBe(true)
      if (r.type === 'composite') for (const c of r.params.conditions) expect(ind.has(c.indicatorId)).toBe(true)
    }
  })
  it('every indicator has exactly one NASA/published anchor', () => {
    expect(content.indicators.map((i) => content.anchors.filter((a) => a.indicatorId === i.id).length)).toEqual(content.indicators.map(() => 1))
  })
  it('rule ids are unique', () => {
    const ids = content.rules.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
