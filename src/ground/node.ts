import type { Content } from '../content'
import type { CrewState, GroundDB, InboxRecord, OutboxRecord } from '../data/db'
import { appendAuditEntry } from '../data/groundRepo'
import type { LinkKeys } from '../link/keys'
import { persistProgress, queuedOf, sealAndQueue } from '../link/outbox'
import { DOWNLINK, parsePayload, type AlertPayload, type CheckinPayload, type PayloadOf } from '../link/payloads'
import type { BundleKind } from '../link/protocol'
import { open, ReplayGuard, type Header, type SealedBundle } from '../link/security'
import { CREW } from '../sim'
import { applyFinding, transition, type GroundAlert } from './alerts'

/** No health data for this long -> the ground shows "unknown", never old data as current (Team Asteron setting). */
export const STALE_AFTER_MS = 36 * 3_600_000

export type GroundReceive =
  | { ok: true; kind: BundleKind; duplicate?: boolean; id: string; alertsCreated?: number }
  | { ok: false; reason: 'bad-signature' | 'decrypt-failed' | 'replay' | 'unknown-sender' | 'hash-mismatch' | 'malformed' | 'wrong-direction' | 'bad-payload'; detail?: string }

export interface CrewOverview {
  crewId: string
  name: string
  shownStatus: string
  lastKnownStatus: string | null
  stale: boolean
  dataAgeMs: number | null
  lastContactAt: number | null
  tier: 1 | 2 | 3 | 4 | null
  directive: 'follow-tier' | 'onboard-protocol' | null
  systems: Record<string, string>
  dose?: PayloadOf<'dose'>
  openAlerts: number
}

const iso = (ms: number) => new Date(ms).toISOString()

/** The flight surgeon's side. Knows only what arrived over the link, verified and opened. */
export class GroundNode {
  private readonly db: GroundDB
  private readonly keys: LinkKeys
  private readonly content: Content
  private guard = new ReplayGuard()

  constructor(deps: { db: GroundDB; keys: LinkKeys; content: Content }) {
    this.db = deps.db
    this.keys = deps.keys
    this.content = deps.content
  }

  async init() {
    this.guard = new ReplayGuard()
    for (const r of await this.db.inbox.toArray()) this.guard.check({ id: r.id, seq: r.seq } as Header)
  }

  private audit(at: number, actor: string, action: string, detail: string) {
    return appendAuditEntry(this.db, { at, actor, action, detail })
  }

  private enqueue(kind: BundleKind, crewId: string, payload: unknown, nowMs: number): Promise<OutboxRecord> {
    return sealAndQueue(this.db, this.keys, 'G', kind, crewId, payload, nowMs)
  }

  private async reject(sealed: SealedBundle, nowMs: number, reason: Exclude<GroundReceive, { ok: true }>['reason'], detail?: string): Promise<GroundReceive> {
    const bundleId = String(sealed?.header?.id ?? 'unknown')
    await this.db.rejected.add({ at: nowMs, bundleId, src: String(sealed?.header?.src ?? 'unknown'), reason })
    await this.audit(nowMs, 'ground', 'rejected', `bundle ${bundleId}: ${reason}${detail ? ` (${detail})` : ''}`)
    return { ok: false, reason, detail }
  }

  /** Opens a downlink bundle: sender, signature, replay, decryption, hash, direction, then payload schema. */
  async receive(sealed: SealedBundle, nowMs: number): Promise<GroundReceive> {
    const r = await open(sealed, this.keys.pinned, async () => this.keys.receiveKey, this.guard)
    if (!r.ok) return this.reject(sealed, nowMs, r.reason)
    const b = r.bundle
    if (!DOWNLINK.includes(b.kind)) return this.reject(sealed, nowMs, 'wrong-direction', `${b.kind} is not a downlink kind`)
    if (r.duplicate) {
      if (b.kind !== 'ack') await this.enqueue('ack', b.crewId, { ids: [b.id], at: iso(nowMs) }, nowMs)
      return { ok: true, kind: b.kind, duplicate: true, id: b.id }
    }
    const p = parsePayload(b.kind, b.payload)
    if (!p.ok) return this.reject(sealed, nowMs, 'bad-payload', p.error)

    if (b.kind === 'ack') {
      await this.db.outbox.where('id').anyOf((p.value as PayloadOf<'ack'>).ids).modify({ state: 'acked' })
      return { ok: true, kind: 'ack', id: b.id }
    }
    const rec: InboxRecord = { id: b.id, seq: b.seq, kind: b.kind, crewId: b.crewId, createdAt: b.createdAt, receivedAt: nowMs, src: sealed.header.src, payload: p.value }
    await this.db.inbox.put(rec)
    await this.audit(nowMs, 'ground', 'received', `${b.kind} ${b.id} for ${b.crewId} (seq ${b.seq}, created ${iso(b.createdAt)})`)

    let alertsCreated = 0
    if (b.kind === 'checkin' || b.kind === 'alert') await this.updateCrew(b.crewId, b.createdAt, nowMs, p.value as CheckinPayload | AlertPayload)
    if (b.kind === 'alert') alertsCreated = await this.openAlerts(b.id, b.createdAt, nowMs, p.value as AlertPayload)
    if (b.kind === 'dose') await this.updateDose(b.crewId, nowMs, p.value as PayloadOf<'dose'>)
    if (b.kind === 'heartbeat') await this.db.settings.put({ key: 'station.lastContact', value: { at: nowMs, createdAt: b.createdAt } })
    await this.enqueue('ack', b.crewId, { ids: [b.id], at: iso(nowMs) }, nowMs)
    return { ok: true, kind: b.kind, id: b.id, alertsCreated }
  }

  private async updateCrew(crewId: string, createdAt: number, nowMs: number, p: CheckinPayload | AlertPayload) {
    const prev = await this.db.crewState.get(crewId)
    const lastContactAt = Math.max(prev?.lastContactAt ?? 0, nowMs)
    if (prev && prev.dataCreatedAt > createdAt) { await this.db.crewState.put({ ...prev, lastContactAt }); return } // older data never overwrites newer
    const next: CrewState = {
      crewId, lastContactAt, dataCreatedAt: createdAt, overall: p.assessment.overall, tier: p.assessment.tier, directive: p.link.directive,
      systems: p.assessment.systems, summary: { ...((prev?.summary as object) ?? {}), findings: p.assessment.findings, link: p.link },
    }
    await this.db.crewState.put(next)
  }

  private async updateDose(crewId: string, nowMs: number, dose: PayloadOf<'dose'>) {
    const prev = await this.db.crewState.get(crewId)
    const base: CrewState = prev ?? { crewId, lastContactAt: nowMs, dataCreatedAt: 0, overall: 'unknown', tier: 1, directive: 'follow-tier', systems: {}, summary: {} }
    await this.db.crewState.put({ ...base, lastContactAt: Math.max(base.lastContactAt, nowMs), summary: { ...(base.summary as object), dose } })
  }

  private async openAlerts(bundleId: string, createdAt: number, nowMs: number, p: AlertPayload): Promise<number> {
    let alerts = await this.db.alerts.where('crewId').equals(p.crewId).toArray()
    let created = 0
    for (const f of p.assessment.findings) {
      if (f.status !== 'concern' && f.status !== 'urgent') continue
      const r = applyFinding(alerts, { crewId: p.crewId, ruleId: f.ruleId, status: f.status, reason: f.reason, bundleId, dataCreatedAt: createdAt, at: nowMs })
      alerts = r.alerts
      await this.db.alerts.put(r.alert)
      if (r.created) {
        created++
        await this.audit(nowMs, 'ground', 'alert-created', `${r.alert.id}: ${f.status} ${f.ruleId} for ${p.crewId}`)
      }
    }
    return created
  }

  private async step(id: string, to: 'acknowledged' | 'resolved', actor: string, nowMs: number, note?: string): Promise<GroundAlert> {
    const a = await this.db.alerts.get(id)
    if (!a) throw new Error(`Alert ${id} not found`)
    const [next] = transition([a], id, to, { at: nowMs, actor, note })
    await this.db.alerts.put(next)
    await this.audit(nowMs, actor, to, `${id}${next.note && to === 'resolved' ? `: ${next.note}` : ''}`)
    return next
  }

  acknowledgeAlert(id: string, actor: string, nowMs: number) { return this.step(id, 'acknowledged', actor, nowMs) }

  /** Resolving needs a note; the note is sent up to the crew as advice. */
  async resolveAlert(id: string, actor: string, note: string, nowMs: number) {
    const a = await this.step(id, 'resolved', actor, nowMs, note)
    await this.sendAdvice(a.crewId, a.note!, nowMs, id, actor)
    return a
  }

  async sendAdvice(crewId: string, text: string, nowMs: number, alertId?: string, actor = 'flight surgeon') {
    const t = text.trim()
    if (!t) throw new Error('Advice cannot be empty')
    const rec = await this.enqueue('advice', crewId, { crewId, at: iso(nowMs), text: t, ...(alertId ? { alertId } : {}) }, nowMs)
    await this.audit(nowMs, actor, 'advice-queued', `${rec.id} to ${crewId}${alertId ? ` (alert ${alertId})` : ''}`)
    return rec
  }

  /** A solar particle event warning goes up at the highest priority, with NASA's shelter guidance. */
  async sendSpaceWeather(ev: { eventId: string; message: string }, nowMs: number) {
    const sh = this.content.radiation.shelter
    const rec = await this.enqueue('space-weather', 'all', { eventId: ev.eventId, at: iso(nowMs), message: ev.message, shelterText: sh.text, sourceIds: sh.sourceIds }, nowMs)
    await this.audit(nowMs, 'space weather officer', 'space-weather-queued', `${rec.id}: ${ev.eventId}`)
    return rec
  }

  async crewOverview(nowMs: number): Promise<CrewOverview[]> {
    const states = new Map((await this.db.crewState.toArray()).map((s) => [s.crewId, s]))
    const open = await this.db.alerts.where('state').anyOf('new', 'acknowledged').toArray()
    return CREW.map((c) => {
      const s = states.get(c.id)
      const dataAgeMs = s && s.dataCreatedAt > 0 ? nowMs - s.dataCreatedAt : null
      const stale = dataAgeMs === null || dataAgeMs > STALE_AFTER_MS
      return {
        crewId: c.id, name: c.name,
        shownStatus: stale ? 'unknown' : s!.overall,
        lastKnownStatus: s && s.dataCreatedAt > 0 ? s.overall : null,
        stale, dataAgeMs, lastContactAt: s?.lastContactAt ?? null,
        tier: s && s.dataCreatedAt > 0 ? s.tier : null,
        directive: s && s.dataCreatedAt > 0 ? s.directive : null,
        systems: s?.systems ?? {},
        dose: (s?.summary as { dose?: PayloadOf<'dose'> } | undefined)?.dose,
        openAlerts: open.filter((a) => a.crewId === c.id).length,
      }
    })
  }

  async journal(crewId: string) {
    return (await this.db.inbox.where('crewId').equals(crewId).toArray())
      .filter((r) => r.kind === 'journal').map((r) => r.payload as PayloadOf<'journal'>).sort((a, b) => a.at.localeCompare(b.at))
  }

  queue() { return queuedOf(this.db) }
  async outboxKinds() { return (await this.queue()).map((r) => r.kind) }

  async requeueUnacked(nowMs: number, timeoutMs: number): Promise<number> {
    const stale = (await this.db.outbox.where('state').equals('sent').toArray()).filter((r) => r.kind !== 'ack' && (r.lastSentAt ?? 0) + timeoutMs < nowMs)
    await this.db.outbox.bulkPut(stale.map((r) => ({ ...r, state: 'queued' as const, sentBytes: 0, attempts: r.attempts + 1 })))
    return stale.length
  }

  /** Called by the link runtime after it moved bytes. */
  progress(queue: OutboxRecord[], launches: { id: string; completedAt: number }[]) { return persistProgress(this.db, queue, launches) }
}
