import Dexie, { type Table } from 'dexie'
import type { Reading } from '../engine/types'

export type BundleKind = 'checkin' | 'evaluation' | 'alert' | 'report' | 'heartbeat'
export interface Bundle {
  id: string
  seq: number
  kind: BundleKind
  crewId: string
  priority: 0 | 1 | 2 | 3
  createdAt: string
  payload: unknown
  sha256: string
}
export interface OutboxItem extends Bundle { status: 'queued' | 'sent' | 'delivered'; attempts: number; lastSentAt?: string }
export interface Setting { key: string; value: unknown }

/** Station side. The Ground console never opens this database. */
export class StationDB extends Dexie {
  readings!: Table<Reading & { id?: number }, number>
  outbox!: Table<OutboxItem, string>
  settings!: Table<Setting, string>
  constructor(name = 'asteron-station') {
    super(name)
    this.version(1).stores({
      readings: '++id, crewId, indicatorId, takenAt, [crewId+indicatorId]',
      outbox: 'id, seq, status, priority',
      settings: 'key',
    })
  }
}

export interface InboxItem extends Bundle { receivedAt: string }
export type AlertState = 'new' | 'acknowledged' | 'resolved'
export interface Alert {
  id: string
  crewId: string
  ruleId: string
  status: 'watch' | 'concern' | 'urgent'
  state: AlertState
  firstSeen: string
  lastSeen: string
  reason: string
  note?: string
}
export interface AuditEntry { id?: number; at: string; actor: string; action: string; detail: string }

/** Ground side: only knows what arrived over the link. */
export class GroundDB extends Dexie {
  inbox!: Table<InboxItem, string>
  alerts!: Table<Alert, string>
  audit!: Table<AuditEntry, number>
  settings!: Table<Setting, string>
  constructor(name = 'asteron-ground') {
    super(name)
    this.version(1).stores({
      inbox: 'id, seq, crewId, kind, receivedAt',
      alerts: 'id, crewId, state, status, lastSeen',
      audit: '++id, at',
      settings: 'key',
    })
  }
}

export const stationDb = new StationDB()
export const groundDb = new GroundDB()
