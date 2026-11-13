export type Status = 'normal' | 'watch' | 'concern' | 'urgent' | 'unknown'
export type KnownStatus = Exclude<Status, 'unknown'>
export const STATUS_RANK: Record<KnownStatus, number> = { normal: 0, watch: 1, concern: 2, urgent: 3 }

export type SystemId = 'cardio' | 'resp' | 'brain' | 'metabolic' | 'msk' | 'immune'
export const SYSTEM_IDS: SystemId[] = ['brain', 'cardio', 'resp', 'metabolic', 'msk', 'immune']

export type Provenance =
  | { kind: 'simulated'; generator: string; version: string; seed: number; scenarioId: string }
  | { kind: 'manual'; enteredBy: 'crew' }
  | { kind: 'judge'; enteredAt: string }

export interface Indicator {
  id: string
  label: string
  unit: string
  systems: SystemId[]
  plausible: [number, number]
  step: number
  default: number
  madFloor: number
  staleHours: number
  howToMeasure: string
  sourceIds: string[]
}

export interface Reading {
  crewId: string
  indicatorId: string
  value: number
  takenAt: string
  provenance?: Provenance
}

export type CompareOp = 'gt' | 'gte' | 'lt' | 'lte'
export type Condition =
  | { indicatorId: string; kind: CompareOp; value: number }
  | { indicatorId: string; kind: 'baselineAbove' | 'baselineBelow'; value: number }

interface RuleBase {
  id: string
  indicatorIds: string[]
  resultStatus: KnownStatus
  message: string
  sourceIds: string[]
  reviewStatus: 'unchecked' | 'source-checked'
  minTier?: 1 | 2 | 3 | 4
}
export type Rule =
  | (RuleBase & { type: 'absolute'; params: { op: CompareOp; value: number } })
  | (RuleBase & { type: 'baseline'; params: { k: number; minDays: number; direction: 'above' | 'below' } })
  | (RuleBase & { type: 'trend'; params: { days: number; direction: 'up' | 'down'; minChange: number } })
  | (RuleBase & { type: 'composite'; params: { conditions: Condition[]; minDays?: number } })

export interface FiredRule {
  ruleId: string
  reason: string
  readings: Reading[]
  sourceIds: string[]
}

export interface Evaluation {
  indicatorId: string
  status: Status
  fired: FiredRule[]
  notes: string[]
}

export interface SystemEvaluation {
  systemId: SystemId
  status: Status
  hasUnknown: boolean
  drivers: Evaluation[]
}

export interface TierDecision {
  tier: 1 | 2 | 3 | 4
  reasons: string[]
}

export interface TierContent {
  tier: 1 | 2 | 3 | 4
  label: string
  actions: string[]
  sourceIds: string[]
}
