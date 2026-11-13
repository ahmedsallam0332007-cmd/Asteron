import { queuedOf } from '../link/outbox'
import type { JournalEntry, OutboxRecord, StationDB } from './db'

/** Bundles still to send: highest priority first, then oldest sequence. Sent and acknowledged ones are skipped. */
export const queuedOutbox = (db: StationDB): Promise<OutboxRecord[]> => queuedOf(db)

export async function addJournal(db: StationDB, e: Omit<JournalEntry, 'id'>): Promise<number> {
  const text = e.text.trim()
  if (!text) throw new Error('A journal entry cannot be empty')
  return db.journal.add({ ...e, text })
}

/** Private by default: only entries the astronaut marked "share" ever leave the station. */
export async function shareableJournal(db: StationDB, crewId: string): Promise<JournalEntry[]> {
  return (await db.journal.where('crewId').equals(crewId).toArray()).filter((j) => j.share).sort((a, b) => a.at.localeCompare(b.at))
}
