import { describe, expect, it } from 'vitest'
import { applyAck, makeBundle, planWindow, receive, type OutboxEntry } from './protocol'
import { linkState } from './contactPlan'

const T0 = Date.parse('2026-11-13T09:00:00Z')
const entry = (b: Awaited<ReturnType<typeof makeBundle>>): OutboxEntry => ({ bundle: b, sentBytes: 0, state: 'queued' })

async function sampleOutbox() {
  return [
    entry(await makeBundle({ id: 'raw-ecg', seq: 1, kind: 'raw', crewId: 'rahal', createdAt: T0, payload: { note: 'ECG 24 h' }, bytesOverride: 43_200_000 })),
    entry(await makeBundle({ id: 'ci-1', seq: 2, kind: 'checkin', crewId: 'rahal', createdAt: T0, payload: { hr: 72, temp: 36.7 } })),
    entry(await makeBundle({ id: 'alert-1', seq: 3, kind: 'alert', crewId: 'rahal', createdAt: T0 + 1, payload: { status: 'urgent', rule: 'comp-infection-severe' } })),
    entry(await makeBundle({ id: 'report-1', seq: 4, kind: 'report', crewId: 'rahal', createdAt: T0 + 2, payload: { text: 'Tier 4 report' } })),
  ]
}

describe('store-and-forward protocol', () => {
  it('sends urgent first, then report, check-in, raw data last', async () => {
    const { transmissions } = planWindow(await sampleOutbox(), 10_000_000)
    expect(transmissions.map((t) => t.id)).toEqual(['alert-1', 'report-1', 'ci-1', 'raw-ecg'])
  })
  it('never exceeds the window capacity', async () => {
    const r = planWindow(await sampleOutbox(), 5_000)
    expect(r.usedBytes).toBeLessThanOrEqual(5_000)
  })
  it('Mars direct-to-Earth (500 bit/s, 6 h pass = 1.35 MB): alert, report and check-in arrive; raw ECG continues next pass', async () => {
    const cap = linkState('mars-direct', T0).capacityBytes
    expect(cap).toBe(1_350_000)
    const r = planWindow(await sampleOutbox(), cap)
    const byId = Object.fromEntries(r.transmissions.map((t) => [t.id, t]))
    expect(byId['alert-1'].complete && byId['report-1'].complete && byId['ci-1'].complete).toBe(true)
    expect(byId['raw-ecg'].complete).toBe(false)
    expect(r.outbox.find((e) => e.bundle.id === 'raw-ecg')!.state).toBe('sending')
  })
  it('resumes a partly sent bundle from the byte where it stopped, across windows', async () => {
    let ob = await sampleOutbox()
    let windows = 0
    while (ob.some((e) => e.state !== 'sent')) {
      const r = planWindow(ob, 1_350_000)
      if (windows > 0) expect(r.transmissions[0].from).toBe(ob.find((e) => e.bundle.id === 'raw-ecg')!.sentBytes)
      ob = r.outbox
      windows++
    }
    expect(windows).toBe(Math.ceil((43_200_000 + 1_000) / 1_350_000))
  })
  it('ground verifies SHA-256, rejects an altered bundle and ignores duplicates', async () => {
    const [, ci, alert] = await sampleOutbox()
    const store = new Map()
    const tampered = { ...alert.bundle, payload: alert.bundle.payload.replace('urgent', 'normal') }
    const r1 = await receive(store, [ci.bundle, tampered])
    expect(r1.accepted.map((b) => b.id)).toEqual(['ci-1'])
    expect(r1.rejected[0].reason).toContain('SHA-256')
    const r2 = await receive(store, [ci.bundle])
    expect(r2.accepted).toEqual([])
    expect(r2.ack).toEqual(['ci-1'])
    expect(store.size).toBe(1)
  })
  it('custody: only acknowledged bundles are released', async () => {
    const ob = (await sampleOutbox()).map((e) => ({ ...e, state: 'sent' as const }))
    const after = applyAck(ob, ['alert-1'])
    expect(after.filter((e) => e.state === 'acked').map((e) => e.bundle.id)).toEqual(['alert-1'])
  })
})
