import { z } from 'zod'

const status = z.enum(['normal', 'watch', 'concern', 'urgent'])
const systemId = z.enum(['cardio', 'resp', 'brain', 'metabolic', 'msk', 'immune'])
const sourceIds = z.array(z.string().min(1)).min(1)
const op = z.enum(['gt', 'gte', 'lt', 'lte'])

export const sourceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['published', 'design']),
  title: z.string().min(1),
  publisher: z.string().min(1),
  year: z.number().int().optional(),
  url: z.string().url().optional(),
  verifiedAgainstOriginal: z.boolean(),
  /** SHA-256 of the original document we read, when we downloaded it. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  note: z.string().optional(),
})

export const indicatorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  unit: z.string(),
  systems: z.array(systemId).min(1),
  plausible: z.tuple([z.number(), z.number()]),
  step: z.number().positive(),
  default: z.number(),
  madFloor: z.number().positive(),
  staleHours: z.number().positive(),
  howToMeasure: z.string().min(10),
  sourceIds,
})

const condition = z.union([
  z.object({ indicatorId: z.string(), kind: op, value: z.number() }),
  z.object({ indicatorId: z.string(), kind: z.enum(['baselineAbove', 'baselineBelow']), value: z.number() }),
])

const base = {
  id: z.string().min(1),
  indicatorIds: z.array(z.string()).min(1),
  resultStatus: status,
  message: z.string().min(10),
  sourceIds,
  reviewStatus: z.enum(['unchecked', 'source-checked']),
  minTier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
}

export const ruleSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('absolute'), params: z.object({ op, value: z.number() }) }),
  z.object({
    ...base,
    type: z.literal('baseline'),
    params: z.object({ k: z.number().positive(), minDays: z.number().int().min(3), direction: z.enum(['above', 'below']) }),
  }),
  z.object({
    ...base,
    type: z.literal('trend'),
    params: z.object({ days: z.number().int().min(2), direction: z.enum(['up', 'down']), minChange: z.number().positive() }),
  }),
  z.object({
    ...base,
    type: z.literal('composite'),
    params: z.object({ conditions: z.array(condition).min(2), minDays: z.number().int().min(3).optional() }),
  }),
])

export const tierSchema = z.object({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  label: z.string().min(1),
  actions: z.array(z.string().min(1)).min(1),
  sourceIds,
})

export const guidanceSchema = z.object({
  systemId: systemId,
  status: status,
  text: z.string().min(20),
  sourceIds,
})

export const anchorSchema = z.object({ indicatorId: z.string(), text: z.string().min(20), sourceIds })

const sourced = { sourceIds }
const doseRange = z.object({ low: z.number().positive(), high: z.number().positive(), note: z.string().min(10), ...sourced })
  .refine((r) => r.low <= r.high, 'low must not exceed high')

/** Radiation: published limits and published daily dose ranges only. */
export const radiationSchema = z.object({
  limits: z.object({
    careerMsv: z.object({ value: z.number().positive(), clause: z.string(), ...sourced }),
    speEventMsv: z.object({ value: z.number().positive(), clause: z.string(), ...sourced }),
  }),
  dailyDoseMsv: z.object({ iss: doseRange, moon: doseRange, mars: doseRange }),
  speEventEstimateMsv: z.object({
    moon: z.object({ shielded: z.number().positive(), note: z.string().min(10), ...sourced }),
    mars: z.object({ shielded: z.number().positive(), unshielded: z.number().positive(), note: z.string().min(10), ...sourced }),
  }),
  shelter: z.object({ text: z.string().min(20), ...sourced }),
})

/** Mission settings. Each is labelled: a plan setting or an estimate, never a medical threshold. */
export const missionSchema = z.object({
  exercisePlan: z.object({
    minutesPerDay: z.number().positive(),
    daysPerWeek: z.number().int().min(1).max(7),
    kind: z.literal('mission-plan-setting'),
    note: z.string().min(10),
    ...sourced,
  }),
  adaptationDays: z.object({ value: z.number().int().positive(), kind: z.literal('estimate'), note: z.string().min(10), ...sourced }),
})
