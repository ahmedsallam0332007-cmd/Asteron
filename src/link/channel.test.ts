import { describe, expect, it } from 'vitest'
import { advanceLink, type Sendable } from './channel'
import { oneWaySeconds, linkState } from './contactPlan'

const T = (iso: string) => Date.parse(iso)
const q = (id: string, priority: 0 | 1 | 2 | 3, bytes: number, seq: number): Sendable => ({ id, seq, priority, bytes, sentBytes: 0, state: 'queued' })

describe('link channel over time (contact windows, conjunction, bandwidth, partial sends)', () => {
  it('ISS (continuous, 600 Mbps): everything goes in priority order and arrives 0.25 s later', () => {
    const from = T('2026-11-13T08:00:00Z')
    const r = advanceLink({ profile: 'iss', from, to: from + 1000, cut: false, queue: [q('c', 1, 500, 1), q('a', 3, 500, 2), q('r', 2, 500, 3)] })
    expect(r.launches.map((l) => l.id)).toEqual(['a', 'r', 'c'])
    for (const l of r.launches) expect(l.arrivesAt - l.completedAt).toBeCloseTo(250, 6)
    expect(r.queue.every((x) => x.state === 'sent')).toBe(true)
  })

  it('a cut link sends nothing and keeps everything queued', () => {
    const from = T('2026-11-13T08:00:00Z')
    const r = advanceLink({ profile: 'iss', from, to: from + 60_000, cut: true, queue: [q('a', 3, 10, 1)] })
    expect(r.launches).toEqual([])
    expect(r.queue[0]).toMatchObject({ state: 'queued', sentBytes: 0 })
  })

  it('Mars between relay passes: nothing until the 14:00 UTC pass opens', () => {
    const from = T('2026-11-13T09:00:00Z')
    const idle = advanceLink({ profile: 'mars', from, to: T('2026-11-13T13:59:59Z'), cut: false, queue: [q('a', 3, 100, 1)] })
    expect(idle.launches).toEqual([])
    const open = advanceLink({ profile: 'mars', from, to: T('2026-11-13T14:00:10Z'), cut: false, queue: [q('a', 3, 100, 1)] })
    expect(open.launches).toHaveLength(1)
    expect(open.launches[0].completedAt).toBeGreaterThanOrEqual(T('2026-11-13T14:00:00Z'))
  })

  it('arrival time uses the real JPL Horizons light time at the moment the bundle completes', () => {
    const from = T('2026-11-13T14:00:00Z')
    const r = advanceLink({ profile: 'mars', from, to: from + 1000, cut: false, queue: [q('a', 3, 100, 1)] })
    const l = r.launches[0]
    expect(l.arrivesAt - l.completedAt).toBeCloseTo(oneWaySeconds('mars', l.completedAt).sec * 1000, 3)
    expect((l.arrivesAt - l.completedAt) / 60_000).toBeGreaterThan(3)
  })

  it('Mars solar conjunction (Nov 2023, NASA moratorium): nothing goes for days, then the queue drains after it', () => {
    const from = T('2023-11-15T00:00:00Z')
    expect(linkState('mars', from).blackout).not.toBeNull()
    const during = advanceLink({ profile: 'mars', from, to: T('2023-11-20T00:00:00Z'), cut: false, queue: [q('a', 3, 100, 1)] })
    expect(during.launches).toEqual([])
    const after = advanceLink({ profile: 'mars', from, to: T('2023-12-05T00:00:00Z'), cut: false, queue: [q('a', 3, 100, 1)] })
    expect(after.launches).toHaveLength(1)
    expect(linkState('mars', after.launches[0].completedAt).blackout).toBeNull()
  })

  it('Mars direct-to-Earth at 500 bit/s: a 1000-byte bundle needs 16 s, so 10 s sends 625 bytes and the rest resumes', () => {
    const from = T('2026-11-13T14:00:00Z')
    const a = advanceLink({ profile: 'mars-direct', from, to: from + 10_000, cut: false, queue: [q('big', 1, 1000, 1)] })
    expect(a.launches).toEqual([])
    expect(a.queue[0]).toMatchObject({ sentBytes: 625, state: 'sending' })
    const b = advanceLink({ profile: 'mars-direct', from: from + 10_000, to: from + 20_000, cut: false, queue: a.queue })
    expect(b.launches.map((l) => l.id)).toEqual(['big'])
    expect(b.launches[0].completedAt).toBeCloseTo(from + 16_000, 0)
  })

  it('an urgent bundle queued behind a large one is sent before the large one finishes', () => {
    const from = T('2026-11-13T14:00:00Z')
    const a = advanceLink({ profile: 'mars-direct', from, to: from + 4_000, cut: false, queue: [q('big', 1, 1000, 1)] })
    const b = advanceLink({ profile: 'mars-direct', from: from + 4_000, to: from + 30_000, cut: false, queue: [...a.queue, q('urgent', 3, 50, 2)] })
    expect(b.launches.map((l) => l.id)).toEqual(['urgent', 'big'])
  })

  it('sent and acknowledged items are never sent again', () => {
    const from = T('2026-11-13T08:00:00Z')
    const r = advanceLink({ profile: 'iss', from, to: from + 1000, cut: false, queue: [{ ...q('x', 3, 10, 1), state: 'sent', sentBytes: 10 }, { ...q('y', 3, 10, 2), state: 'acked', sentBytes: 10 }] })
    expect(r.launches).toEqual([])
  })

  it('rejects an interval that runs backwards', () => {
    expect(() => advanceLink({ profile: 'iss', from: 10, to: 5, cut: false, queue: [] })).toThrow()
  })
})
