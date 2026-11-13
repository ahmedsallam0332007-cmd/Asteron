import { combine } from './aggregate'
import type { Evaluation, Rule, SystemEvaluation, TierDecision } from './types'

const BASE_TIER = { normal: 1, unknown: 1, watch: 2, concern: 3, urgent: 4 } as const

/** Tier from the worst system status, raised by any fired rule's minTier. */
export function decideTier(systems: SystemEvaluation[], evals: Evaluation[], rules: Rule[]): TierDecision {
  const worst = combine(systems.map((s) => s.status)).status
  let tier: 1 | 2 | 3 | 4 = BASE_TIER[worst]
  const reasons: string[] = [`Worst system status: ${worst}.`]
  const byId = new Map(rules.map((r) => [r.id, r]))
  for (const e of evals) {
    for (const f of e.fired) {
      const min = byId.get(f.ruleId)?.minTier
      if (min && min > tier) {
        tier = min
        reasons.push(`Rule ${f.ruleId} requires at least tier ${min}.`)
      }
    }
  }
  if (systems.some((s) => s.hasUnknown)) reasons.push('Some indicators have no recent reading. Re-measure them.')
  return { tier, reasons }
}
