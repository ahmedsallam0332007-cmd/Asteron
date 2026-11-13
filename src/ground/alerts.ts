/**
 * Ground alert lifecycle (B9). Pure: no I/O, the clock is passed in.
 *  - States: new -> acknowledged -> resolved (resolving needs a note). No skipping, no going back.
 *  - Dedupe: the same crew + rule while still open updates the existing alert.
 *  - Status only rises while open: a milder later finding never hides a worse one.
 */
export type AlertStatus = 'watch' | 'concern' | 'urgent'
export type AlertState = 'new' | 'acknowledged' | 'resolved'
const RANK: Record<AlertStatus, number> = { watch: 1, concern: 2, urgent: 3 }
const NEXT: Record<AlertState, AlertState | null> = { new: 'acknowledged', acknowledged: 'resolved', resolved: null }

export interface AlertHistoryEntry { state: AlertState; at: number; actor: string; note?: string }
export interface GroundAlert {
  id: string
  crewId: string
  ruleId: string
  status: AlertStatus
  state: AlertState
  reason: string
  firstSeen: number
  lastSeen: number
  /** Station clock time of the newest data behind this alert (for "data as of"). */
  dataCreatedAt: number
  count: number
  bundleIds: string[]
  history: AlertHistoryEntry[]
  note?: string
}

export interface Finding { crewId: string; ruleId: string; status: AlertStatus; reason: string; bundleId: string; dataCreatedAt: number; at: number }

export const alertKey = (crewId: string, ruleId: string, firstSeen: number) => `${crewId}:${ruleId}:${firstSeen}`

export function applyFinding(alerts: GroundAlert[], f: Finding): { alerts: GroundAlert[]; created: boolean; alert: GroundAlert } {
  const open = alerts.find((a) => a.crewId === f.crewId && a.ruleId === f.ruleId && a.state !== 'resolved')
  if (open) {
    if (open.bundleIds.includes(f.bundleId)) return { alerts, created: false, alert: open }
    const updated: GroundAlert = {
      ...open,
      status: RANK[f.status] > RANK[open.status] ? f.status : open.status,
      reason: RANK[f.status] >= RANK[open.status] ? f.reason : open.reason,
      lastSeen: Math.max(open.lastSeen, f.at),
      dataCreatedAt: Math.max(open.dataCreatedAt, f.dataCreatedAt),
      count: open.count + 1,
      bundleIds: [...open.bundleIds, f.bundleId],
    }
    return { alerts: alerts.map((a) => (a.id === open.id ? updated : a)), created: false, alert: updated }
  }
  const alert: GroundAlert = {
    id: alertKey(f.crewId, f.ruleId, f.at), crewId: f.crewId, ruleId: f.ruleId, status: f.status, state: 'new', reason: f.reason,
    firstSeen: f.at, lastSeen: f.at, dataCreatedAt: f.dataCreatedAt, count: 1, bundleIds: [f.bundleId],
    history: [{ state: 'new', at: f.at, actor: 'ground' }],
  }
  return { alerts: [...alerts, alert], created: true, alert }
}

export function transition(alerts: GroundAlert[], id: string, to: AlertState, by: { at: number; actor: string; note?: string }): GroundAlert[] {
  const a = alerts.find((x) => x.id === id)
  if (!a) throw new Error(`Alert ${id} not found`)
  if (NEXT[a.state] !== to) throw new Error(`Alert ${id}: ${a.state} -> ${to} is not allowed (order is new -> acknowledged -> resolved)`)
  const note = by.note?.trim()
  if (to === 'resolved' && !note) throw new Error('Resolving an alert needs a short note saying what was decided')
  const next: GroundAlert = { ...a, state: to, history: [...a.history, { state: to, at: by.at, actor: by.actor, ...(note ? { note } : {}) }], ...(to === 'resolved' ? { note } : {}) }
  return alerts.map((x) => (x.id === id ? next : x))
}
