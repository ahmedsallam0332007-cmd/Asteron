import { evaluate } from './evaluate'
import { aggregateSystems, overall } from './aggregate'
import { decideTier } from './escalate'
import type { Content } from '../content'
import type { Reading } from './types'

export * from './types'
export { evaluate } from './evaluate'
export { aggregateSystems, overall, combine } from './aggregate'
export { decideTier } from './escalate'

/** One call: readings + now -> everything the UI shows. */
export function assess(content: Pick<Content, 'indicators' | 'rules'>, readings: Reading[], now: string) {
  const evaluations = evaluate({ readings, now, indicators: content.indicators, rules: content.rules })
  const systems = aggregateSystems(evaluations, content.indicators)
  return { evaluations, systems, overall: overall(systems), tier: decideTier(systems, evaluations, content.rules) }
}

export { summarizeDose } from './radiation'
export type { DoseRecord, DoseSummary } from './radiation'
export { exerciseAdherence } from './countermeasures'
export type { Adherence } from './countermeasures'
export { adaptationPhase } from './adaptation'
