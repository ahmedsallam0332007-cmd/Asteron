import type { TierDecision } from '../engine/types'

/**
 * Longest acceptable wait for the flight surgeon's answer, per tier (Team Asteron design, not a medical source).
 * Tier 4 = urgent: 30 min. Tier 3 = contact flight surgeon: 24 h.
 */
/** How long the ground team needs to read a report and answer, per tier (Team Asteron assumption). */
export const GROUND_RESPONSE_MIN: Record<number, number> = { 1: 240, 2: 120, 3: 60, 4: 5 }

export const MAX_WAIT_MS: Record<number, number> = { 3: 24 * 3_600_000, 4: 30 * 60_000 }

export interface LinkAwareDecision {
  tier: TierDecision['tier']
  groundCanAnswerInTime: boolean
  waitMs: number
  maxWaitMs: number | null
  directive: 'follow-tier' | 'onboard-protocol'
  explanation: string
}

const fmt = (ms: number) => (ms < 90_000 ? `${Math.round(ms / 1000)} s` : ms < 2 * 3_600_000 ? `${Math.round(ms / 60_000)} min` : ms < 2 * 86_400_000 ? `${(ms / 3_600_000).toFixed(1)} h` : `${(ms / 86_400_000).toFixed(1)} days`)

/** Adds the link reality to the medical tier: if the ground cannot answer in time, the crew acts on board. */
export function linkAware(tier: TierDecision, waitMs: number): LinkAwareDecision {
  const max = MAX_WAIT_MS[tier.tier] ?? null
  const inTime = max === null || waitMs <= max
  return {
    tier: tier.tier,
    groundCanAnswerInTime: inTime,
    waitMs,
    maxWaitMs: max,
    directive: inTime ? 'follow-tier' : 'onboard-protocol',
    explanation: inTime
      ? `Earliest answer from the flight surgeon: in ${fmt(waitMs)}.`
      : `Earliest answer from the flight surgeon: in ${fmt(waitMs)}, longer than the ${fmt(max!)} this tier allows. Follow the on-board medical protocol with the crew medical officer now and send the report; do not wait for Earth.`,
  }
}
export { fmt as formatWait }
