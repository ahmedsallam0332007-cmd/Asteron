import { expect } from 'vitest'
import { linkState } from '../link/contactPlan'
import type { SimTrace } from './simulation'

/** No bundle lost or stored twice, every attack refused, audit chain intact, nothing sent during a blackout. */
export function checkInvariants(t: SimTrace) {
  const ids = t.bundles.map((b) => b.id)
  expect(new Set(ids).size, 'bundle ids unique').toBe(ids.length)
  for (const b of t.bundles) expect(['delivered', 'in-queue', 'in-flight'], b.id).toContain(b.outcome)
  for (const a of t.events.filter((e) => e.actor === 'attacker')) {
    const b = t.bundles.find((x) => x.id === a.bundleId)!
    expect(b.rejections + (b.outcome === 'in-flight' ? 1 : 0), a.bundleId).toBeGreaterThanOrEqual(1)
  }
  expect(t.summary.rejected).toBe(t.bundles.reduce((n, b) => n + b.rejections, 0))
  expect(t.summary.storedTwice).toBe(0)
  expect(t.summary.auditOk).toBe(true)
  expect(t.summary.delivered + t.summary.queuedAtEnd + t.summary.inFlightAtEnd).toBe(t.bundles.length)
  for (const b of t.bundles) if (b.sentAt !== undefined) expect(linkState(t.options.profile, b.sentAt).blackout, b.id).toBeNull()
  for (const b of t.bundles.filter((x) => x.arrivedAt !== undefined)) expect(b.arrivedAt!, b.id).toBeGreaterThan(b.sentAt!)
}
