import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { content } from '../content'
import { StationDB } from '../data/db'
import { seedScenario } from '../data/seed'
import { provisionPair } from '../link/keys'
import { makeBundle, type BundleKind } from '../link/protocol'
import { open, ReplayGuard, seal } from '../link/security'
import { StationNode } from './node'

const NOW = Date.parse('2026-11-13T14:30:00Z') // inside a Mars relay pass
const CONJ = Date.parse('2023-11-18T14:30:00Z') // Mars solar conjunction (NASA moratorium 11-25 Nov 2023)
const MANUAL = { kind: 'manual', enteredBy: 'crew' } as const
const HEALTHY = { hr_rest: 66, bp_sys: 112, bp_dia: 72, spo2: 98, temp: 36.7, sleep_h: 7.7, mood: 4, exercise_min: 95, stress: 2, workload: 3, sym_headache: 0, sym_rash: 0, sym_dizzy: 0, sym_vision: 0 }
const URGENT = { ...HEALTHY, temp: 38.6, hr_rest: 112, spo2: 91 }
let n = 0

async function setup(profile: 'iss' | 'mars' = 'mars', at = NOW) {
  const db = new StationDB(`st-${++n}-${Math.random()}`)
  await seedScenario(db, 'healthy', new Date(at).toISOString())
  const { station, ground } = await provisionPair()
  const node = new StationNode({ db, keys: station, content, profile: () => profile })
  await node.init()
  const fromGround = async (kind: BundleKind, payload: unknown, seq: number, id = `g-${seq}`) =>
    seal(await makeBundle({ id, seq, kind, crewId: 'rahal', createdAt: at, payload }), ground.identity, ground.sendKey)
  const openOnGround = (s: Parameters<typeof open>[0]) => open(s, ground.pinned, async () => ground.receiveKey, new ReplayGuard())
  return { db, node, fromGround, openOnGround, ground }
}

describe('station node: check-in -> engine -> link-aware decision -> sealed outbox', () => {
  it('a healthy check-in queues one sealed check-in bundle and records the decision', async () => {
    const { db, node } = await setup()
    const r = await node.submitCheckIn({ crewId: 'rahal', values: HEALTHY, provenance: () => MANUAL, now: NOW })
    expect(r.assessment.tier.tier).toBe(1)
    expect(r.link.directive).toBe('follow-tier')
    expect(r.queued.map((q) => q.kind)).toEqual(['checkin'])
    expect(await db.escalations.count()).toBe(1)
    expect((await db.outbox.toArray())[0]).toMatchObject({ state: 'queued', priority: 1, crewId: 'rahal' })
  })

  it('urgent values during Mars solar conjunction: tier 4, on-board protocol, alert + report + check-in queued, alert first', async () => {
    const { node } = await setup('mars', CONJ)
    const r = await node.submitCheckIn({ crewId: 'rahal', values: URGENT, provenance: () => MANUAL, now: CONJ })
    expect(r.assessment.tier.tier).toBe(4)
    expect(r.link.directive).toBe('onboard-protocol')
    expect(r.link.waitMs).toBeGreaterThan(24 * 3_600_000)
    expect(r.queued.map((q) => q.kind).sort()).toEqual(['alert', 'checkin', 'report'])
    expect((await node.queue()).map((q) => q.kind)).toEqual(['alert', 'report', 'checkin'])
  })

  it('the same urgent values on the ISS: the flight surgeon can answer in time, so follow the tier', async () => {
    const { node } = await setup('iss')
    const r = await node.submitCheckIn({ crewId: 'rahal', values: URGENT, provenance: () => MANUAL, now: NOW })
    expect(r.assessment.tier.tier).toBe(4)
    expect(r.link.directive).toBe('follow-tier')
  })

  it('what leaves the station is encrypted: no medical words or values in the sealed bundle, and the ground can open it', async () => {
    const { db, node, openOnGround } = await setup()
    await node.submitCheckIn({ crewId: 'rahal', values: URGENT, provenance: () => MANUAL, now: NOW })
    for (const rec of await db.outbox.toArray()) {
      const wire = JSON.stringify(rec.sealed)
      expect(wire).not.toMatch(/spo2|urgent|38\.6|Fever/i)
      const o = await openOnGround(rec.sealed)
      expect(o.ok).toBe(true)
    }
  })

  it('sequence numbers increase by one per bundle and survive a restart', async () => {
    const { db, node } = await setup()
    await node.submitCheckIn({ crewId: 'rahal', values: URGENT, provenance: () => MANUAL, now: NOW })
    const again = new StationNode({ db, keys: (node as unknown as { keys: never }).keys, content, profile: () => 'mars' })
    await again.init()
    const hb = await again.heartbeat(NOW + 1000)
    const seqs = (await db.outbox.toArray()).map((r) => r.seq).sort((a, b) => a - b)
    expect(seqs).toEqual([1, 2, 3, 4])
    expect(hb.kind).toBe('heartbeat')
    expect(hb.priority).toBe(0)
  })

  it('custody: an acknowledgement from the ground releases exactly the acknowledged bundles', async () => {
    const { db, node, fromGround } = await setup()
    const r = await node.submitCheckIn({ crewId: 'rahal', values: URGENT, provenance: () => MANUAL, now: NOW })
    await db.outbox.toCollection().modify({ state: 'sent', sentBytes: 1 })
    const alert = r.queued.find((q) => q.kind === 'alert')!
    const res = await node.receive(await fromGround('ack', { ids: [alert.id], at: new Date(NOW).toISOString() }, 1), NOW + 1)
    expect(res).toMatchObject({ ok: true, kind: 'ack' })
    const states = Object.fromEntries((await db.outbox.toArray()).map((x) => [x.kind, x.state]))
    expect(states).toEqual({ alert: 'acked', report: 'sent', checkin: 'sent' })
  })

  it('advice from the flight surgeon is stored and acknowledged back to the ground', async () => {
    const { db, node, fromGround } = await setup()
    const res = await node.receive(await fromGround('advice', { crewId: 'rahal', at: new Date(NOW).toISOString(), text: 'Rest, fluids, recheck temperature in 4 h.' }, 7), NOW + 5)
    expect(res).toMatchObject({ ok: true, kind: 'advice' })
    expect(await db.inbox.count()).toBe(1)
    expect((await node.queue()).map((q) => q.kind)).toEqual(['ack'])
  })

  it('a solar storm warning sets the shelter directive', async () => {
    const { node, fromGround } = await setup()
    await node.receive(await fromGround('space-weather', { eventId: 'spe-1', at: new Date(NOW).toISOString(), message: 'Solar particle event expected.', shelterText: 'Go to the most shielded area.', sourceIds: ['nasa-ochmo-radiation-brief'] }, 3), NOW + 9)
    expect(await node.shelter()).toMatchObject({ eventId: 'spe-1', receivedAt: NOW + 9 })
  })

  it('rejects a tampered bundle, a replayed sequence number and downlink-only kinds; duplicates are only re-acknowledged', async () => {
    const { db, node, fromGround } = await setup()
    const good = await fromGround('advice', { crewId: 'rahal', at: new Date(NOW).toISOString(), text: 'Drink water.' }, 4)
    const tampered = { ...good, ct: good.ct.slice(0, -4) + (good.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA') }
    expect(await node.receive(tampered, NOW)).toMatchObject({ ok: false })
    expect(await node.receive(good, NOW)).toMatchObject({ ok: true })
    expect(await node.receive(good, NOW)).toMatchObject({ ok: true, duplicate: true })
    const replay = await fromGround('advice', { crewId: 'rahal', at: new Date(NOW).toISOString(), text: 'Ignore the doctor.' }, 4, 'g-other')
    expect(await node.receive(replay, NOW)).toMatchObject({ ok: false, reason: 'replay' })
    const wrongWay = await fromGround('checkin', {}, 5)
    expect(await node.receive(wrongWay, NOW)).toMatchObject({ ok: false, reason: 'wrong-direction' })
    expect(await db.inbox.count()).toBe(1)
    expect((await node.queue()).filter((q) => q.kind === 'ack')).toHaveLength(2)
  })

  it('a payload that fails its schema is refused even with a valid signature', async () => {
    const { db, node, fromGround } = await setup()
    const bad = await fromGround('advice', { crewId: 'rahal', text: '' }, 6)
    expect(await node.receive(bad, NOW)).toMatchObject({ ok: false, reason: 'bad-payload' })
    expect(await db.inbox.count()).toBe(0)
  })

  it('the replay guard is rebuilt from the inbox after a restart', async () => {
    const { db, node, fromGround } = await setup()
    await node.receive(await fromGround('advice', { crewId: 'rahal', at: new Date(NOW).toISOString(), text: 'Sleep early tonight.' }, 11), NOW)
    const again = new StationNode({ db, keys: (node as unknown as { keys: never }).keys, content, profile: () => 'mars' })
    await again.init()
    const replay = await fromGround('advice', { crewId: 'rahal', at: new Date(NOW).toISOString(), text: 'Forged.' }, 11, 'g-forged')
    expect(await again.receive(replay, NOW)).toMatchObject({ ok: false, reason: 'replay' })
  })

  it('a journal entry leaves the station only if the astronaut marked it shared', async () => {
    const { db, node } = await setup()
    const priv = await db.journal.add({ crewId: 'rahal', at: new Date(NOW).toISOString(), text: 'Private thoughts.', share: false })
    const shared = await db.journal.add({ crewId: 'rahal', at: new Date(NOW).toISOString(), text: 'Please tell the surgeon I sleep badly.', share: true })
    await expect(node.shareJournal(priv, NOW)).rejects.toThrow(/private/)
    const b = await node.shareJournal(shared, NOW)
    expect(b.kind).toBe('journal')
    expect((await db.journal.get(shared))?.sentBundleId).toBe(b.id)
  })

  it('custody timeout: a sent bundle with no acknowledgement is queued again; acks are never resent', async () => {
    const { db, node } = await setup()
    await node.submitCheckIn({ crewId: 'rahal', values: HEALTHY, provenance: () => MANUAL, now: NOW })
    await node.heartbeat(NOW)
    await db.outbox.toCollection().modify({ state: 'sent', lastSentAt: NOW })
    await db.outbox.add({ ...(await db.outbox.toArray())[0], id: 'ack-x', kind: 'ack', seq: 99 })
    expect(await node.requeueUnacked(NOW + 10_000, 60_000)).toBe(0)
    expect(await node.requeueUnacked(NOW + 120_000, 60_000)).toBe(2)
    const recs = await db.outbox.toArray()
    expect(recs.filter((r) => r.state === 'queued').every((r) => r.attempts === 1 && r.sentBytes === 0)).toBe(true)
    expect(recs.find((r) => r.id === 'ack-x')?.state).toBe('sent')
  })

  it('a daily dose summary bundle carries the career dose against the 600 mSv limit', async () => {
    const { node, openOnGround } = await setup()
    await node.recordDoses([{ crewId: 'rahal', takenAt: new Date(NOW).toISOString(), doseMsv: 0.5, kind: 'gcr', provenance: { kind: 'simulated', generator: 't', version: 't', seed: 1, scenarioId: 't' } }])
    const b = await node.sendDoseSummary('rahal', NOW)
    const o = await openOnGround(b.sealed)
    expect(o.ok && JSON.parse(o.bundle.payload)).toMatchObject({ crewId: 'rahal', careerMsv: 160.5 })
  })

  it('rejects check-in values outside the plausible range before saving anything', async () => {
    const { db, node } = await setup()
    const before = await db.readings.count()
    await expect(node.submitCheckIn({ crewId: 'rahal', values: { ...HEALTHY, spo2: 120 }, provenance: () => MANUAL, now: NOW })).rejects.toThrow(/spo2/)
    expect(await db.readings.count()).toBe(before)
    expect(await db.outbox.count()).toBe(0)
  })

  it('a malformed bundle (garbage fields) is rejected, never crashes the station', async () => {
    const { node } = await setup()
    const garbage = { header: { id: 'junk', seq: 1, src: 'asteron-ground' }, iv: '%%%', ct: 'not base64!', sig: '' } as never
    expect(await node.receive(garbage, NOW)).toMatchObject({ ok: false, reason: 'malformed' })
  })
})
