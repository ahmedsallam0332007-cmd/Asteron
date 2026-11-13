import type { Table } from 'dexie'
import type Dexie from 'dexie'
import type { OutboxRecord, Setting } from '../data/db'
import type { LinkKeys } from './keys'
import { makeBundle, type BundleKind } from './protocol'
import { seal } from './security'

type OutboxDb = Dexie & { outbox: Table<OutboxRecord, string>; settings: Table<Setting, string> }
const SEQ_KEY = 'link.seq'

/** Monotonic per-node sequence number, persisted so a restart never reuses one. */
export function nextSeq(db: OutboxDb): Promise<number> {
  return db.transaction('rw', db.settings, async () => {
    const cur = ((await db.settings.get(SEQ_KEY))?.value as number | undefined) ?? 0
    await db.settings.put({ key: SEQ_KEY, value: cur + 1 })
    return cur + 1
  })
}

/** Builds, seals (AES-GCM + ECDSA) and stores a bundle in the outbox. Nothing waits for the link. */
export async function sealAndQueue(db: OutboxDb, keys: LinkKeys, prefix: 'S' | 'G', kind: BundleKind, crewId: string, payload: unknown, nowMs: number): Promise<OutboxRecord> {
  const seq = await nextSeq(db)
  const id = `${prefix}${String(seq).padStart(6, '0')}-${crypto.randomUUID().slice(0, 8)}`
  const b = await makeBundle({ id, seq, kind, crewId, createdAt: nowMs, payload })
  const sealed = await seal(b, keys.identity, keys.sendKey)
  const rec: OutboxRecord = { id, seq, kind, priority: b.priority, crewId, createdAt: nowMs, bytes: JSON.stringify(sealed).length, sentBytes: 0, state: 'queued', attempts: 0, sealed }
  await db.outbox.put(rec)
  return rec
}

export async function queuedOf(db: OutboxDb): Promise<OutboxRecord[]> {
  const rows = await db.outbox.where('state').anyOf('queued', 'sending').toArray()
  return rows.sort((a, b) => b.priority - a.priority || a.seq - b.seq)
}

/** Persists what the link did to the queue: bytes sent, state, and when each bundle finished leaving. */
export async function persistProgress(db: OutboxDb, queue: OutboxRecord[], launches: { id: string; completedAt: number }[]) {
  const done = new Map(launches.map((l) => [l.id, l.completedAt]))
  const changed = queue.filter((r) => r.sentBytes > 0 || done.has(r.id))
  await db.outbox.bulkPut(changed.map((r) => (done.has(r.id) ? { ...r, lastSentAt: done.get(r.id) } : r)))
}
