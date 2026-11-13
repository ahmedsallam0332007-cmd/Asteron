import Dexie, { type Table } from 'dexie'
import type { Reading } from '../engine/types'
import type { DoseRecord } from '../engine/radiation'
import type { BundleKind } from '../link/protocol'
import type { SealedBundle } from '../link/security'
import type { GroundAlert } from '../ground/alerts'

export interface Setting { key: string; value: unknown }

/** A sealed bundle waiting for (or in) transmission. Custody is released only on acknowledgement. */
export interface OutboxRecord {
  id: string
  seq: number
  kind: BundleKind
  priority: 0 | 1 | 2 | 3
  crewId: string
  createdAt: number
  bytes: number
  sentBytes: number
  state: 'queued' | 'sending' | 'sent' | 'acked'
  attempts: number
  lastSentAt?: number
  sealed: SealedBundle
}

/** A bundle that arrived, was verified and opened. */
export interface InboxRecord {
  id: string
  seq: number
  kind: BundleKind
  crewId: string
  /** Sender clock. */
  createdAt: number
  /** Receiver clock. */
  receivedAt: number
  src: string
  payload: unknown
}

export interface JournalEntry { id?: number; crewId: string; at: string; text: string; share: boolean; sentBundleId?: string }
export interface EscalationRecord {
  id?: number
  crewId: string
  at: string
  tier: 1 | 2 | 3 | 4
  overall: string
  directive: 'follow-tier' | 'onboard-protocol'
  waitMs: number
  maxWaitMs: number | null
  explanation: string
  reasons: string[]
  profile: string
}

/** Station side. The Ground console never opens this database. */
export class StationDB extends Dexie {
  readings!: Table<Reading & { id?: number }, number>
  doses!: Table<DoseRecord & { id?: number }, number>
  journal!: Table<JournalEntry, number>
  escalations!: Table<EscalationRecord, number>
  outbox!: Table<OutboxRecord, string>
  inbox!: Table<InboxRecord, string>
  settings!: Table<Setting, string>
  constructor(name = 'asteron-station') {
    super(name)
    this.version(1).stores({
      readings: '++id, crewId, indicatorId, takenAt, [crewId+indicatorId]',
      outbox: 'id, seq, status, priority',
      settings: 'key',
    })
    this.version(2)
      .stores({
        readings: '++id, crewId, indicatorId, takenAt, [crewId+indicatorId]',
        doses: '++id, crewId, takenAt, [crewId+takenAt]',
        journal: '++id, crewId, at, share',
        escalations: '++id, crewId, at',
        outbox: 'id, seq, state, priority',
        inbox: 'id, seq, kind, receivedAt',
        settings: 'key',
      })
      .upgrade((tx) => tx.table('outbox').clear()) // v1 outbox held unsealed bundles of an older shape
  }
}

export interface CrewState {
  crewId: string
  /** Ground clock: when the last bundle from this crew member arrived. */
  lastContactAt: number
  /** Station clock: when the newest data the ground holds was created. */
  dataCreatedAt: number
  overall: string
  tier: 1 | 2 | 3 | 4
  directive: 'follow-tier' | 'onboard-protocol'
  systems: Record<string, string>
  summary: unknown
}
export interface AuditRow { id?: number; at: number; actor: string; action: string; detail: string; prev: string; hash: string }
export interface RejectedRecord { id?: number; at: number; bundleId: string; src: string; reason: string }
export interface ReportRecord { id?: number; at: number; title: string; body: unknown }

/** Ground side: only knows what arrived over the link. */
export class GroundDB extends Dexie {
  inbox!: Table<InboxRecord, string>
  crewState!: Table<CrewState, string>
  alerts!: Table<GroundAlert, string>
  audit!: Table<AuditRow, number>
  reports!: Table<ReportRecord, number>
  outbox!: Table<OutboxRecord, string>
  rejected!: Table<RejectedRecord, number>
  settings!: Table<Setting, string>
  constructor(name = 'asteron-ground') {
    super(name)
    this.version(1).stores({
      inbox: 'id, seq, crewId, kind, receivedAt',
      alerts: 'id, crewId, state, status, lastSeen',
      audit: '++id, at',
      settings: 'key',
    })
    this.version(2)
      .stores({
        inbox: 'id, seq, crewId, kind, receivedAt',
        crewState: 'crewId',
        alerts: 'id, crewId, ruleId, state, status, lastSeen',
        audit: '++id, at',
        reports: '++id, at',
        outbox: 'id, seq, state, priority',
        rejected: '++id, at, bundleId',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        await tx.table('audit').clear() // v1 audit rows had no hash chain
        await tx.table('alerts').clear()
      })
  }
}

export const stationDb = new StationDB()
export const groundDb = new GroundDB()
