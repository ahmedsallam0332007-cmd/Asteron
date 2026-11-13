import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { GroundDB, StationDB } from './db'
import { addJournal, queuedOutbox, shareableJournal } from './stationRepo'
import { appendAuditEntry, verifyAuditChain } from './groundRepo'
import type { OutboxRecord } from './db'

let n = 0
const name = (p: string) => `${p}-${++n}-${Math.random().toString(36).slice(2)}`

describe('station database v2', () => {
  it('has the tables the station pipeline needs', () => {
    const db = new StationDB(name('st'))
    expect(db.tables.map((t) => t.name).sort()).toEqual(['doses', 'escalations', 'inbox', 'journal', 'outbox', 'readings', 'settings'])
    db.close()
  })
  it('outbox order: highest priority first, then oldest sequence; acknowledged bundles are not sent again', async () => {
    const db = new StationDB(name('st'))
    const rec = (id: string, seq: number, priority: 0 | 1 | 2 | 3, state: OutboxRecord['state']): OutboxRecord =>
      ({ id, seq, priority, state, sentBytes: 0, attempts: 0, bytes: 10, createdAt: seq, kind: 'checkin', crewId: 'c', sealed: { header: {} as never, iv: '', ct: '', sig: '' } })
    await db.outbox.bulkPut([rec('a', 1, 1, 'queued'), rec('b', 2, 3, 'queued'), rec('c', 3, 3, 'sending'), rec('d', 4, 2, 'acked'), rec('e', 5, 0, 'sent')])
    expect((await queuedOutbox(db)).map((r) => r.id)).toEqual(['b', 'c', 'a'])
    db.close()
  })
  it('journal entries stay private unless the astronaut chooses to share them', async () => {
    const db = new StationDB(name('st'))
    await addJournal(db, { crewId: 'rahal', at: '2026-11-13T08:00:00.000Z', text: 'Missed home today.', share: false })
    await addJournal(db, { crewId: 'rahal', at: '2026-11-13T09:00:00.000Z', text: 'Please tell the surgeon my sleep is off.', share: true })
    expect((await shareableJournal(db, 'rahal')).map((j) => j.text)).toEqual(['Please tell the surgeon my sleep is off.'])
    db.close()
  })
  it('rejects an empty journal entry', async () => {
    const db = new StationDB(name('st'))
    await expect(addJournal(db, { crewId: 'rahal', at: '2026-11-13T08:00:00.000Z', text: '   ', share: false })).rejects.toThrow(/empty/)
    db.close()
  })
})

describe('ground database v2', () => {
  it('has the tables the ground pipeline needs, and never the station readings table', () => {
    const db = new GroundDB(name('gr'))
    const t = db.tables.map((x) => x.name).sort()
    expect(t).toEqual(['alerts', 'audit', 'crewState', 'inbox', 'outbox', 'rejected', 'reports', 'settings'])
    expect(t).not.toContain('readings')
    db.close()
  })
  it('audit log is hash-chained in the database; editing a stored entry is detected', async () => {
    const db = new GroundDB(name('gr'))
    await appendAuditEntry(db, { at: 1, actor: 'ground', action: 'received', detail: 'bundle b1' })
    await appendAuditEntry(db, { at: 2, actor: 'surgeon', action: 'acknowledged', detail: 'alert a1' })
    await appendAuditEntry(db, { at: 3, actor: 'surgeon', action: 'resolved', detail: 'alert a1: fluids and rest' })
    expect(await verifyAuditChain(db)).toEqual({ ok: true, entries: 3 })
    const second = (await db.audit.orderBy('id').toArray())[1]
    await db.audit.update(second.id!, { detail: 'alert a1 (edited)' })
    expect(await verifyAuditChain(db)).toEqual({ ok: false, entries: 3, brokenAt: 1 })
    db.close()
  })
  it('appending is serialised: concurrent appends still form one chain', async () => {
    const db = new GroundDB(name('gr'))
    await Promise.all(Array.from({ length: 10 }, (_, i) => appendAuditEntry(db, { at: i, actor: 'ground', action: 'received', detail: `b${i}` })))
    expect(await verifyAuditChain(db)).toEqual({ ok: true, entries: 10 })
    db.close()
  })
})
