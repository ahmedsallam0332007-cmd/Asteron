import { assess } from './index'
import type { Indicator, Reading, Rule, Status } from './types'

export interface Vector {
  id: string
  description: string
  now: string
  series: { indicatorId: string; values: (number | null)[]; stepHours?: number; endOffsetHours?: number }[]
  expect: {
    indicators?: Record<string, Status>
    systems?: Record<string, Status>
    overall?: Status
    tier?: number
    fired?: string[]
    notFired?: string[]
    notes?: Record<string, string>
  }
}
export interface VectorResult { id: string; description: string; passed: boolean; failures: string[]; ms: number }

/** Expands a vector's series into readings: the last value is at now - endOffsetHours, earlier ones step back. */
export function expand(v: Vector): Reading[] {
  const now = Date.parse(v.now)
  const out: Reading[] = []
  for (const s of v.series) {
    const step = (s.stepHours ?? 24) * 3_600_000
    const end = now - (s.endOffsetHours ?? 0) * 3_600_000
    s.values.forEach((value, i) => {
      if (value === null) return
      out.push({ crewId: 'vector', indicatorId: s.indicatorId, value, takenAt: new Date(end - (s.values.length - 1 - i) * step).toISOString() })
    })
  }
  return out
}

export function runVector(v: Vector, content: { indicators: Indicator[]; rules: Rule[] }): VectorResult {
  const t0 = performance.now()
  const a = assess(content, expand(v), v.now)
  const f: string[] = []
  const ev = new Map(a.evaluations.map((e) => [e.indicatorId, e]))
  const fired = new Set(a.evaluations.flatMap((e) => e.fired.map((x) => x.ruleId)))
  for (const [id, want] of Object.entries(v.expect.indicators ?? {})) {
    const got = ev.get(id)?.status
    if (got !== want) f.push(`${id}: expected ${want}, got ${got}`)
  }
  for (const [id, want] of Object.entries(v.expect.systems ?? {})) {
    const got = a.systems.find((s) => s.systemId === id)?.status
    if (got !== want) f.push(`system ${id}: expected ${want}, got ${got}`)
  }
  if (v.expect.overall && a.overall.status !== v.expect.overall) f.push(`overall: expected ${v.expect.overall}, got ${a.overall.status}`)
  if (v.expect.tier && a.tier.tier !== v.expect.tier) f.push(`tier: expected ${v.expect.tier}, got ${a.tier.tier}`)
  for (const r of v.expect.fired ?? []) if (!fired.has(r)) f.push(`rule ${r} should fire`)
  for (const r of v.expect.notFired ?? []) if (fired.has(r)) f.push(`rule ${r} should not fire`)
  for (const [id, note] of Object.entries(v.expect.notes ?? {})) {
    if (!ev.get(id)?.notes.includes(note)) f.push(`${id}: expected note "${note}", got ${JSON.stringify(ev.get(id)?.notes)}`)
  }
  return { id: v.id, description: v.description, passed: f.length === 0, failures: f, ms: performance.now() - t0 }
}

const files = import.meta.glob<Vector[]>('./__vectors__/*.json', { eager: true, import: 'default' })
export const VECTOR_GROUPS: { group: string; vectors: Vector[] }[] = Object.entries(files)
  .map(([path, vectors]) => ({ group: path.replace(/^.*\/(.*)\.json$/, '$1'), vectors }))
  .sort((a, b) => a.group.localeCompare(b.group))
