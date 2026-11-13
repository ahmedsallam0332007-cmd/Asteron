import { STATUS_RANK, SYSTEM_IDS } from './types'
import type { Evaluation, Indicator, KnownStatus, Status, SystemEvaluation } from './types'

/**
 * Worst status wins. `unknown` never hides a real concern:
 * known concerns outrank unknown; unknown outranks normal.
 */
export function combine(statuses: Status[]): { status: Status; hasUnknown: boolean } {
  const known = statuses.filter((s): s is KnownStatus => s !== 'unknown')
  const hasUnknown = statuses.length > known.length
  if (known.length === 0) return { status: 'unknown', hasUnknown }
  const worst = known.reduce((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w))
  return { status: worst === 'normal' && hasUnknown ? 'unknown' : worst, hasUnknown }
}

export function aggregateSystems(evals: Evaluation[], indicators: Indicator[]): SystemEvaluation[] {
  const byInd = new Map(evals.map((e) => [e.indicatorId, e]))
  return SYSTEM_IDS.map((systemId) => {
    const members = indicators.filter((i) => i.systems.includes(systemId)).map((i) => byInd.get(i.id)!).filter(Boolean)
    const { status, hasUnknown } = combine(members.map((m) => m.status))
    const rank = (s: Status) => (s === 'unknown' ? 0.5 : STATUS_RANK[s])
    const drivers = members.filter((m) => m.status !== 'normal').sort((a, b) => rank(b.status) - rank(a.status))
    return { systemId, status, hasUnknown, drivers }
  })
}

export const overall = (systems: SystemEvaluation[]) => combine(systems.map((s) => s.status))
