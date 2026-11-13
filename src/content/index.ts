import { z } from 'zod'
import type { Indicator, Rule, TierContent } from '../engine/types'
import { indicatorSchema, ruleSchema, sourceSchema, tierSchema } from './schema'
import indicatorsJson from './indicators.json'
import rulesJson from './rules.json'
import sourcesJson from './sources.json'
import tiersJson from './tiers.json'

export type Source = z.infer<typeof sourceSchema>
export interface Content {
  indicators: Indicator[]
  rules: Rule[]
  sources: Source[]
  tiers: TierContent[]
}

/** Parses and validates all bundled content. Throws with a readable message if anything is malformed. */
export function loadContent(): Content {
  return {
    indicators: z.array(indicatorSchema).parse(indicatorsJson) as Indicator[],
    rules: z.array(ruleSchema).parse(rulesJson) as Rule[],
    sources: z.array(sourceSchema).parse(sourcesJson),
    tiers: z.array(tierSchema).parse(tiersJson) as TierContent[],
  }
}

export const content: Content = loadContent()
export const sourceById = (id: string) => content.sources.find((s) => s.id === id)
