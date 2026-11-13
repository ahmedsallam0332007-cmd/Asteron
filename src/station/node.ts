import type { Content } from '../content'
import { assess, summarizeDose } from '../engine'
import type { DoseRecord } from '../engine/radiation'
import type { Provenance, Reading } from '../engine/types'
import type { EscalationRecord, InboxRecord, OutboxRecord, StationDB } from '../data/db'
import { saveCheckIn } from '../data/checkin'
import { queuedOutbox } from '../data/stationRepo'
import { earliestReply } from '../link/contactPlan'
import { GROUND_RESPONSE_MIN, linkAware, type LinkAwareDecision } from '../link/escalation'
import type { LinkKeys } from '../link/keys'
import { parsePayload, UPLINK, type CheckinPayload } from '../link/payloads'
import type { ProfileId } from '../link/profiles'
import type { BundleKind } from '../link/protocol'
import { persistProgress, sealAndQueue } from '../link/outbox'
import { open, ReplayGuard, type Header, type SealedBundle } from '../link/security'
import { buildReport } from '../lib/report'
import { CREW } from '../sim'

export interface StationDeps { db: StationDB; keys: LinkKeys; content: Content; profile: () => ProfileId }
export type ReceiveResult =
  | { ok: true; kind: BundleKind; duplicate?: boolean; id: string }
  | { ok: false; reason: 'bad-signature' | 'decrypt-failed' | 'replay' | 'unknown-sender' | 'hash-mismatch' | 'malformed' | 'wrong-direction' | 'bad-payload'; detail?: string }

const iso = (ms: number) => new Date(ms).toISOString()
const SHELTER_KEY = 'shelter'
const STATUS_RANK = { watch: 1, concern: 2, urgent: 3 } as const

/**
 * The station side of Asteron. Every event is written to the outbox first (sealed), never waiting for the link.
 * The ground never reads this database: it only sees bundles that crossed the link.
 */
export class StationNode {
  private readonly db: StationDB
  private readonly keys: LinkKeys
  private readonly content: Content
  private readonly profile: () => ProfileId
  private guard = new ReplayGuard()

  constructor(deps: StationDeps) {
    this.db = deps.db
    this.keys = deps.keys
    this.content = deps.content
    this.profile = deps.profile
  }

  /** Rebuilds the replay guard from bundles already accepted, so a restart cannot be used to replay them. */
  async init() {
    this.guard = new ReplayGuard()
    for (const r of await this.db.inbox.toArray()) this.guard.check({ id: r.id, seq: r.seq } as Header)
  }

  /** Seals a payload and stores it in the outbox. */
  enqueue(kind: BundleKind, crewId: string, payload: unknown, nowMs: number): Promise<OutboxRecord> {
    return sealAndQueue(this.db, this.keys, 'S', kind, crewId, payload, nowMs)
  }

  private validateValues(values: Record<string, number>) {
    const problems: string[] = []
    for (const [id, v] of Object.entries(values)) {
      const ind = this.content.indicators.find((i) => i.id === id)
      if (!ind) problems.push(`${id}: unknown indicator`)
      else if (!Number.isFinite(v) || v < ind.plausible[0] || v > ind.plausible[1]) problems.push(`${id}: ${v} is outside ${ind.plausible[0]}-${ind.plausible[1]}`)
    }
    if (problems.length) throw new Error(`Check-in not saved. ${problems.join('; ')}`)
  }

  async submitCheckIn(args: { crewId: string; values: Record<string, number>; provenance: (indicatorId: string) => Provenance; now: number; flightDay?: number }) {
    const crew = CREW.find((c) => c.id === args.crewId)
    if (!crew) throw new Error(`Unknown crew member ${args.crewId}`)
    this.validateValues(args.values)
    const nowIso = iso(args.now)
    const saved = await saveCheckIn(this.db, args.crewId, args.values, nowIso, args.provenance)
    const history = (await this.db.readings.where('crewId').equals(args.crewId).toArray()) as Reading[]
    const assessment = assess(this.content, history, nowIso)
    const profile = this.profile()
    const tier = assessment.tier.tier
    const wait = earliestReply(profile, args.now, GROUND_RESPONSE_MIN[tier]).waitMs
    const link: LinkAwareDecision = linkAware(assessment.tier, wait)

    const escalation: EscalationRecord = {
      crewId: args.crewId, at: nowIso, tier, overall: assessment.overall.status, directive: link.directive,
      waitMs: link.waitMs, maxWaitMs: link.maxWaitMs, explanation: link.explanation, reasons: assessment.tier.reasons, profile,
    }
    await this.db.escalations.add(escalation)

    const rules = new Map(this.content.rules.map((r) => [r.id, r]))
    const seen = new Set<string>()
    type Finding = CheckinPayload['assessment']['findings'][number]
    const findings: Finding[] = assessment.evaluations.flatMap((e) =>
      e.fired.filter((f) => !seen.has(f.ruleId) && seen.add(f.ruleId)).flatMap((f): Finding[] => {
        const status = rules.get(f.ruleId)!.resultStatus
        return status === 'normal' ? [] : [{ ruleId: f.ruleId, indicatorId: e.indicatorId, status, reason: f.reason, sourceIds: f.sourceIds }]
      }),
    ).sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status])
    const summary: CheckinPayload['assessment'] = {
      overall: assessment.overall.status, tier, tierReasons: assessment.tier.reasons, findings,
      systems: Object.fromEntries(assessment.systems.map((s) => [s.systemId, s.status])),
    }
    const linkPayload = { profile, directive: link.directive, waitMs: link.waitMs, maxWaitMs: link.maxWaitMs, explanation: link.explanation }

    const queued: OutboxRecord[] = []
    queued.push(await this.enqueue('checkin', args.crewId, {
      crewId: args.crewId, takenAt: nowIso, flightDay: args.flightDay ?? crew.bio.flightDay,
      readings: saved.map((r) => ({ indicatorId: r.indicatorId, value: r.value, provenance: r.provenance?.kind ?? 'manual' })),
      assessment: summary, link: linkPayload,
    } satisfies CheckinPayload, args.now))
    if (tier >= 3) {
      queued.push(await this.enqueue('alert', args.crewId, { crewId: args.crewId, takenAt: nowIso, assessment: summary, link: linkPayload }, args.now))
      const text = buildReport({ crew, now: nowIso, evaluations: assessment.evaluations, systems: assessment.systems, overall: assessment.overall, tier: assessment.tier, readings: history, content: this.content })
      queued.push(await this.enqueue('report', args.crewId, { crewId: args.crewId, takenAt: nowIso, text: `${text}\n\nLINK: ${link.explanation}` }, args.now))
    }
    return { assessment, link, escalation, queued }
  }

  async heartbeat(nowMs: number) {
    return this.enqueue('heartbeat', 'station', { at: iso(nowMs), queued: (await queuedOutbox(this.db)).length }, nowMs)
  }

  async recordDoses(records: DoseRecord[]) {
    for (const r of records) if (!(r.doseMsv >= 0)) throw new Error(`Invalid dose ${r.doseMsv} mSv`)
    await this.db.doses.bulkAdd(records)
  }

  async sendDoseSummary(crewId: string, nowMs: number) {
    const crew = CREW.find((c) => c.id === crewId)
    if (!crew) throw new Error(`Unknown crew member ${crewId}`)
    const records = await this.db.doses.where('crewId').equals(crewId).toArray()
    const s = summarizeDose({ crewId, priorMsv: crew.bio.priorCareerDoseMsv, records, flightDay: crew.bio.flightDay, missionDays: crew.bio.missionDays, limits: this.content.radiation.limits, now: iso(nowMs) })
    return this.enqueue('dose', crewId, {
      crewId, at: iso(nowMs), careerMsv: s.careerMsv, missionMsv: s.missionMsv, careerFraction: s.careerFraction,
      projectedCareerMsv: s.projectedCareerMsv, largestSpeMsv: s.largestSpeMsv, status: s.status, reasons: s.reasons,
    }, nowMs)
  }

  async shareJournal(entryId: number, nowMs: number) {
    const e = await this.db.journal.get(entryId)
    if (!e) throw new Error(`Journal entry ${entryId} not found`)
    if (!e.share) throw new Error('This journal entry is private. Mark it as shared first.')
    const rec = await this.enqueue('journal', e.crewId, { crewId: e.crewId, at: e.at, text: e.text }, nowMs)
    await this.db.journal.update(entryId, { sentBundleId: rec.id })
    return rec
  }

  /** Opens an uplink bundle: sender, signature, replay, decryption, hash, direction, then payload schema. */
  async receive(sealed: SealedBundle, nowMs: number): Promise<ReceiveResult> {
    const r = await open(sealed, this.keys.pinned, async () => this.keys.receiveKey, this.guard)
    if (!r.ok) return { ok: false, reason: r.reason }
    const b = r.bundle
    if (!UPLINK.includes(b.kind)) return { ok: false, reason: 'wrong-direction', detail: `${b.kind} is not an uplink kind` }
    if (r.duplicate) {
      if (b.kind !== 'ack') await this.enqueue('ack', 'station', { ids: [b.id], at: iso(nowMs) }, nowMs)
      return { ok: true, kind: b.kind, duplicate: true, id: b.id }
    }
    const p = parsePayload(b.kind, b.payload)
    if (!p.ok) return { ok: false, reason: 'bad-payload', detail: p.error }

    if (b.kind === 'ack') {
      const ids = (p.value as { ids: string[] }).ids
      await this.db.outbox.where('id').anyOf(ids).modify({ state: 'acked' })
      return { ok: true, kind: 'ack', id: b.id }
    }
    const rec: InboxRecord = { id: b.id, seq: b.seq, kind: b.kind, crewId: b.crewId, createdAt: b.createdAt, receivedAt: nowMs, src: sealed.header.src, payload: p.value }
    await this.db.inbox.put(rec)
    if (b.kind === 'space-weather') {
      const sw = p.value as { eventId: string; message: string; shelterText: string }
      await this.db.settings.put({ key: SHELTER_KEY, value: { eventId: sw.eventId, receivedAt: nowMs, message: sw.message, shelterText: sw.shelterText } })
    }
    await this.enqueue('ack', 'station', { ids: [b.id], at: iso(nowMs) }, nowMs)
    return { ok: true, kind: b.kind, id: b.id }
  }

  async shelter() {
    return (await this.db.settings.get(SHELTER_KEY))?.value as { eventId: string; receivedAt: number; message: string; shelterText: string } | undefined
  }

  queue() { return queuedOutbox(this.db) }

  /** Custody timeout: sent but never acknowledged -> send again. Acknowledgements themselves are not custody-tracked. */
  async requeueUnacked(nowMs: number, timeoutMs: number): Promise<number> {
    const stale = (await this.db.outbox.where('state').equals('sent').toArray()).filter((r) => r.kind !== 'ack' && (r.lastSentAt ?? 0) + timeoutMs < nowMs)
    await this.db.outbox.bulkPut(stale.map((r) => ({ ...r, state: 'queued' as const, sentBytes: 0, attempts: r.attempts + 1 })))
    return stale.length
  }

  /** Called by the link runtime after it moved bytes. */
  progress(queue: OutboxRecord[], launches: { id: string; completedAt: number }[]) { return persistProgress(this.db, queue, launches) }
}
