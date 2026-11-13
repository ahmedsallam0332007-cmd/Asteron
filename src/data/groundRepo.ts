import { appendAudit, verifyAudit, type AuditEntry } from '../link/security'
import type { AuditRow, GroundDB } from './db'

/**
 * Appends are serialised per database: each new row must chain to the one before it,
 * and the hash is computed with Web Crypto (async), which cannot run inside an IndexedDB transaction.
 */
const chains = new WeakMap<GroundDB, Promise<unknown>>()

export function appendAuditEntry(db: GroundDB, e: { at: number; actor: string; action: string; detail: string }): Promise<AuditRow> {
  const run = async () => {
    const last = await db.audit.orderBy('id').last()
    const prevLog: AuditEntry[] = last ? [{ at: last.at, actor: last.actor, action: last.action, detail: last.detail, prev: last.prev, hash: last.hash }] : []
    const next = (await appendAudit(prevLog, e)).at(-1)!
    const row: AuditRow = { ...next }
    row.id = await db.audit.add(row)
    return row
  }
  const p = (chains.get(db) ?? Promise.resolve()).then(run, run)
  chains.set(db, p.catch(() => undefined))
  return p
}

export async function verifyAuditChain(db: GroundDB): Promise<{ ok: true; entries: number } | { ok: false; entries: number; brokenAt: number }> {
  const rows = await db.audit.orderBy('id').toArray()
  const broken = await verifyAudit(rows.map(({ at, actor, action, detail, prev, hash }) => ({ at, actor, action, detail, prev, hash })))
  return broken === -1 ? { ok: true, entries: rows.length } : { ok: false, entries: rows.length, brokenAt: broken }
}
