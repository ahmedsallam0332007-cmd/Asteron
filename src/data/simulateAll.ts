import { CREW } from '../sim'
import { checkedInToday, saveCheckIn } from './checkin'
import type { StationDB } from './db'
import type { PendingToday } from './seed'

/** Submits today's simulated sensor values as check-ins for every crew member who has not checked in yet. */
export async function simulateAllCheckIns(db: StationDB, now: string) {
  const pending = ((await db.settings.get('pendingToday'))?.value ?? {}) as PendingToday
  let done = 0
  for (const c of CREW) {
    const p = pending[c.id]
    if (!p) continue
    const last = (await db.readings.where('crewId').equals(c.id).sortBy('takenAt')).at(-1)?.takenAt
    if (checkedInToday(last, now)) continue
    await saveCheckIn(db, c.id, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.value])), now, (id) => p[id].provenance)
    done++
  }
  return done
}
