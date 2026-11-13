import { z } from 'zod'
import type { Indicator, Rule, TierContent } from '../engine/types'
import { anchorSchema, guidanceSchema, indicatorSchema, ruleSchema, sourceSchema, tierSchema } from './schema'
import indicatorsJson from './indicators.json'
import rulesJson from './rules.json'
import sourcesJson from './sources.json'
import tiersJson from './tiers.json'
import guidanceJson from './guidance.json'
import anchorsJson from './anchors.json'

export type Source = z.infer<typeof sourceSchema>
export interface Content {
  indicators: Indicator[]
  rules: Rule[]
  sources: Source[]
  tiers: TierContent[]
  guidance: Guidance[]
  anchors: Anchor[]
}
export type Anchor = z.infer<typeof anchorSchema>
export type Guidance = z.infer<typeof guidanceSchema>

/** Parses and validates all bundled content. Throws with a readable message if anything is malformed. */
export function loadContent(): Content {
  return {
    indicators: z.array(indicatorSchema).parse(indicatorsJson) as Indicator[],
    rules: z.array(ruleSchema).parse(rulesJson) as Rule[],
    sources: z.array(sourceSchema).parse(sourcesJson),
    tiers: z.array(tierSchema).parse(tiersJson) as TierContent[],
    guidance: z.array(guidanceSchema).parse(guidanceJson),
    anchors: z.array(anchorSchema).parse(anchorsJson),
  }
}

export const content: Content = loadContent()
export const sourceById = (id: string) => content.sources.find((s) => s.id === id)
export const indicatorById = (id: string) => content.indicators.find((i) => i.id === id)
