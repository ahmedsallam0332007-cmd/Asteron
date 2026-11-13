import { baselineOf, deviation, DAY_MS } from './stats'
import { STATUS_RANK } from './types'
import type { CompareOp, Condition, Evaluation, FiredRule, Indicator, KnownStatus, Reading, Rule, Status } from './types'

export interface EvalInput {
  readings: Reading[]
  now: string
  indicators: Indicator[]
  rules: Rule[]
}

const cmp = (op: CompareOp, a: number, b: number) =>
  op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b

const OPS: Record<CompareOp, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤' }
const fmt = (n: number) => String(Math.round(n * 100) / 100)

interface Ctx {
  now: number
  byId: Map<string, Indicator>
  series: Map<string, Reading[]> // sorted ascending, takenAt <= now
  latest: Map<string, Reading> // fresh latest only
}

type Result = { fired: false; note?: string } | { fired: true; reason: string; readings: Reading[] }

function unit(ctx: Ctx, id: string) {
  return ctx.byId.get(id)?.unit ?? ''
}

function evalCondition(c: Condition, ctx: Ctx, minDays: number): { ok: boolean; text: string; reading?: Reading; note?: string } {
  const latest = ctx.latest.get(c.indicatorId)
  if (!latest) return { ok: false, text: '', note: `no recent ${c.indicatorId} reading` }
  const label = ctx.byId.get(c.indicatorId)?.label ?? c.indicatorId
  if (c.kind === 'baselineAbove' || c.kind === 'baselineBelow') {
    const b = baselineOf(ctx.series.get(c.indicatorId) ?? [], latest, minDays)
    if (!b) return { ok: false, text: '', reading: latest, note: 'baseline not established' }
    const d = deviation(latest.value, b, ctx.byId.get(c.indicatorId)?.madFloor ?? 1)
    const ok = c.kind === 'baselineAbove' ? d > c.value : -d > c.value
    return { ok, reading: latest, text: `${label} ${latest.value} ${unit(ctx, c.indicatorId)} vs usual ${fmt(b.median)}` }
  }
  return {
    ok: cmp(c.kind, latest.value, c.value),
    reading: latest,
    text: `${label} ${latest.value} ${unit(ctx, c.indicatorId)} (${OPS[c.kind]} ${c.value})`,
  }
}

function evalRule(rule: Rule, ctx: Ctx): Result {
  const id = rule.indicatorIds[0]
  const latest = ctx.latest.get(id)
  switch (rule.type) {
    case 'absolute': {
      if (!latest) return { fired: false }
      if (!cmp(rule.params.op, latest.value, rule.params.value)) return { fired: false }
      return {
        fired: true,
        readings: [latest],
        reason: `${rule.message} Reading: ${latest.value} ${unit(ctx, id)} (rule: ${OPS[rule.params.op]} ${rule.params.value}).`,
      }
    }
    case 'baseline': {
      if (!latest) return { fired: false }
      const b = baselineOf(ctx.series.get(id) ?? [], latest, rule.params.minDays)
      if (!b) return { fired: false, note: 'baseline not established' }
      const d = deviation(latest.value, b, ctx.byId.get(id)?.madFloor ?? 1)
      const hit = rule.params.direction === 'above' ? d > rule.params.k : -d > rule.params.k
      if (!hit) return { fired: false }
      return {
        fired: true,
        readings: [latest],
        reason: `${rule.message} Reading: ${latest.value} ${unit(ctx, id)}; usual ${fmt(b.median)} (${fmt(Math.abs(d))} MAD away, rule: more than ${rule.params.k}).`,
      }
    }
    case 'trend': {
      const s = ctx.series.get(id) ?? []
      const { days, direction, minChange } = rule.params
      if (!latest || s.length < days) return { fired: false }
      const win = s.slice(-days)
      if (win[win.length - 1].takenAt !== latest.takenAt) return { fired: false }
      const span = Date.parse(win[win.length - 1].takenAt) - Date.parse(win[0].takenAt)
      if (span > days * DAY_MS) return { fired: false, note: 'trend window has gaps' }
      const vals = win.map((r) => r.value)
      let monotone = true
      for (let i = 1; i < vals.length; i++) if (direction === 'up' ? vals[i] < vals[i - 1] : vals[i] > vals[i - 1]) monotone = false
      const change = direction === 'up' ? vals[vals.length - 1] - vals[0] : vals[0] - vals[vals.length - 1]
      if (!monotone || change < minChange) return { fired: false }
      return {
        fired: true,
        readings: win,
        reason: `${rule.message} Last ${days} readings: ${vals.join(', ')} ${unit(ctx, id)} (rule: change of ${minChange} or more).`,
      }
    }
    case 'composite': {
      const minDays = rule.params.minDays ?? 7
      const parts = rule.params.conditions.map((c) => evalCondition(c, ctx, minDays))
      if (!parts.every((p) => p.ok)) {
        const note = parts.find((p) => p.note === 'baseline not established')?.note
        return { fired: false, note }
      }
      return {
        fired: true,
        readings: parts.map((p) => p.reading!).filter(Boolean),
        reason: `${rule.message} Seen together: ${parts.map((p) => p.text).join('; ')}.`,
      }
    }
  }
}

export function worstKnown(statuses: KnownStatus[]): KnownStatus {
  return statuses.reduce<KnownStatus>((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w), 'normal')
}

/**
 * Evaluates every indicator. Pure: the clock is the `now` argument.
 * No fresh reading -> `unknown`, never `normal`.
 */
export function evaluate(input: EvalInput): Evaluation[] {
  const now = Date.parse(input.now)
  const byId = new Map(input.indicators.map((i) => [i.id, i]))
  const series = new Map<string, Reading[]>()
  for (const r of input.readings) {
    if (Date.parse(r.takenAt) > now) continue
    const a = series.get(r.indicatorId) ?? []
    a.push(r)
    series.set(r.indicatorId, a)
  }
  const latest = new Map<string, Reading>()
  for (const [id, a] of series) {
    a.sort((x, y) => (x.takenAt < y.takenAt ? -1 : x.takenAt > y.takenAt ? 1 : 0))
    const l = a[a.length - 1]
    const ind = byId.get(id)
    if (ind && now - Date.parse(l.takenAt) <= ind.staleHours * 3_600_000) latest.set(id, l)
  }
  const ctx: Ctx = { now, byId, series, latest }

  const results = input.rules.map((rule) => ({ rule, res: evalRule(rule, ctx) }))
  return input.indicators.map((ind) => {
    const notes: string[] = []
    if (!latest.has(ind.id)) {
      return { indicatorId: ind.id, status: 'unknown' as Status, fired: [], notes: ['no recent reading'] }
    }
    const fired: FiredRule[] = []
    const statuses: KnownStatus[] = []
    for (const { rule, res } of results) {
      if (!rule.indicatorIds.includes(ind.id)) continue
      if (res.fired) {
        fired.push({ ruleId: rule.id, reason: res.reason, readings: res.readings, sourceIds: rule.sourceIds })
        statuses.push(rule.resultStatus)
      } else if (res.note && !notes.includes(res.note)) notes.push(res.note)
    }
    return { indicatorId: ind.id, status: worstKnown(statuses), fired, notes }
  })
}
