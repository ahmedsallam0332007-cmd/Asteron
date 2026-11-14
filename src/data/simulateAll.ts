import { CREW } from '../sim'
import { checkedInToday } from './checkin'
import type { StationDB } from './db'
import type { PendingToday } from './seed'
import type { StationNode } from '../station/node'

/** Submits today's simulated sensor values through the station node for every crew member who has not checked in yet. */
export async function simulateAllCheckIns(db: StationDB, station: StationNode, nowMs: number) {
  const pending = ((await db.settings.get('pendingToday'))?.value ?? {}) as PendingToday
  const now = new Date(nowMs).toISOString()
  let done = 0
  for (const c of CREW) {
    const p = pending[c.id]
    if (!p) continue
    const last = (await db.readings.where('crewId').equals(c.id).sortBy('takenAt')).at(-1)?.takenAt
    if (checkedInToday(last, now)) continue
    await station.submitCheckIn({ crewId: c.id, values: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.value])), provenance: (id) => p[id].provenance, now: nowMs })
    done++
  }
  return done
}
