import { z } from 'zod'
import type { BundleKind } from './protocol'

/**
 * Payload schemas for every bundle kind. Both sides validate a payload after decrypting it:
 * a valid signature proves who sent it, the schema proves it is well-formed before anything uses it.
 */
const status = z.enum(['normal', 'watch', 'concern', 'urgent', 'unknown'])
const tier = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
const finding = z.object({ ruleId: z.string(), indicatorId: z.string(), status: z.enum(['watch', 'concern', 'urgent']), reason: z.string(), sourceIds: z.array(z.string()) })
const linkDecision = z.object({
  profile: z.string(),
  directive: z.enum(['follow-tier', 'onboard-protocol']),
  waitMs: z.number().nonnegative(),
  maxWaitMs: z.number().nullable(),
  explanation: z.string(),
})
const assessment = z.object({ overall: status, tier, systems: z.record(z.string(), status), findings: z.array(finding), tierReasons: z.array(z.string()) })

export const checkinPayload = z.object({
  crewId: z.string(),
  takenAt: z.string(),
  flightDay: z.number().int().positive(),
  readings: z.array(z.object({ indicatorId: z.string(), value: z.number(), provenance: z.enum(['simulated', 'manual', 'judge']) })),
  assessment,
  link: linkDecision,
})
export const alertPayload = z.object({ crewId: z.string(), takenAt: z.string(), assessment, link: linkDecision })
export const reportPayload = z.object({ crewId: z.string(), takenAt: z.string(), text: z.string().min(1) })
export const dosePayload = z.object({
  crewId: z.string(),
  at: z.string(),
  careerMsv: z.number().nonnegative(),
  missionMsv: z.number().nonnegative(),
  careerFraction: z.number().nonnegative(),
  projectedCareerMsv: z.number().nonnegative(),
  largestSpeMsv: z.number().nonnegative(),
  status,
  reasons: z.array(z.string()),
})
export const journalPayload = z.object({ crewId: z.string(), at: z.string(), text: z.string().min(1).max(4000) })
export const heartbeatPayload = z.object({ at: z.string(), queued: z.number().int().nonnegative() })
export const advicePayload = z.object({ crewId: z.string(), at: z.string(), text: z.string().min(1).max(4000), alertId: z.string().optional() })
export const spaceWeatherPayload = z.object({ eventId: z.string(), at: z.string(), message: z.string().min(1), shelterText: z.string().min(1), sourceIds: z.array(z.string()) })
export const ackPayload = z.object({ ids: z.array(z.string()).min(1), at: z.string() })

export const PAYLOAD_SCHEMAS = {
  checkin: checkinPayload,
  alert: alertPayload,
  report: reportPayload,
  dose: dosePayload,
  journal: journalPayload,
  heartbeat: heartbeatPayload,
  raw: z.unknown(),
  advice: advicePayload,
  'space-weather': spaceWeatherPayload,
  ack: ackPayload,
} satisfies Record<BundleKind, z.ZodTypeAny>

export type PayloadOf<K extends BundleKind> = z.infer<(typeof PAYLOAD_SCHEMAS)[K]>
export type CheckinPayload = PayloadOf<'checkin'>
export type AlertPayload = PayloadOf<'alert'>
export type AdvicePayload = PayloadOf<'advice'>
export type SpaceWeatherPayload = PayloadOf<'space-weather'>

/** Which direction each kind may travel. A station never accepts downlink kinds and vice versa. */
export const DOWNLINK: BundleKind[] = ['checkin', 'alert', 'report', 'dose', 'journal', 'heartbeat', 'raw', 'ack']
export const UPLINK: BundleKind[] = ['advice', 'space-weather', 'ack']

export function parsePayload<K extends BundleKind>(kind: K, text: string): { ok: true; value: PayloadOf<K> } | { ok: false; error: string } {
  let json: unknown
  try { json = JSON.parse(text) } catch { return { ok: false, error: 'payload is not JSON' } }
  const r = PAYLOAD_SCHEMAS[kind].safeParse(json)
  return r.success ? { ok: true, value: r.data as PayloadOf<K> } : { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}
