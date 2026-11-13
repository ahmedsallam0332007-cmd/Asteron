import { PROFILES, type ProfileId } from './profiles'
import { oneWaySeconds, windowsAround } from './contactPlan'

/**
 * Moves bytes across the link between two mission times. Pure: no clock, no I/O.
 * - Sends only inside contact windows (relay passes, solar-conjunction blackouts from JPL Horizons).
 * - Capacity = data rate x time in contact. Highest priority first, then oldest.
 * - A bundle that does not fit is sent in part and resumes from the byte where it stopped.
 * - A bundle arrives one light-time after its last byte leaves (Horizons distance at that moment).
 */
export interface Sendable {
  id: string
  seq: number
  priority: number
  bytes: number
  sentBytes: number
  state: 'queued' | 'sending' | 'sent' | 'acked'
}
export interface Launch { id: string; completedAt: number; arrivesAt: number }

export function advanceLink<T extends Sendable>(args: { profile: ProfileId; from: number; to: number; queue: T[]; cut: boolean; rateBps?: number }): { queue: T[]; launches: Launch[] } {
  const { profile, from, to, cut } = args
  if (!(to >= from)) throw new Error('Link interval must not run backwards')
  const queue = args.queue.map((x) => ({ ...x }))
  const launches: Launch[] = []
  if (cut) return { queue, launches }
  const bytesPerMs = (args.rateBps ?? PROFILES[profile].rateBps) / 8 / 1000

  let t = from
  while (t < to) {
    const { current, next } = windowsAround(profile, t)
    if (!current) { t = Math.min(to, next.start); continue }
    const segEnd = Math.min(to, current.end)
    let budget = Math.floor(bytesPerMs * (segEnd - t))
    let used = 0
    const order = queue
      .filter((x) => x.state === 'queued' || x.state === 'sending')
      .sort((a, b) => b.priority - a.priority || a.seq - b.seq)
    for (const x of order) {
      if (budget <= 0) break
      const n = Math.min(x.bytes - x.sentBytes, budget)
      x.sentBytes += n
      budget -= n
      used += n
      if (x.sentBytes === x.bytes) {
        x.state = 'sent'
        const completedAt = t + used / bytesPerMs
        launches.push({ id: x.id, completedAt, arrivesAt: completedAt + oneWaySeconds(profile, completedAt).sec * 1000 })
      } else {
        x.state = 'sending'
      }
    }
    t = segEnd
  }
  return { queue, launches }
}
