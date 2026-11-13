import { describe, expect, it } from 'vitest'
import { EPHEMERIS, EPHEMERIS_SOURCE, conjunctionSpans } from './ephemeris'
import { blackoutAt, earliestReply, linkState, oneWaySeconds, windowsAround } from './contactPlan'
import { linkAware } from './escalation'

const T = (s: string) => Date.parse(s)
const DAY = 86_400_000

describe('JPL Horizons ephemeris (real NASA data)', () => {
  it('covers 2021-2040 daily for Mars and Moon', () => {
    expect(EPHEMERIS.mars.rows).toHaveLength(7306)
    expect(EPHEMERIS.moon.rows).toHaveLength(7306)
    expect(EPHEMERIS_SOURCE.service).toBe('NASA JPL Horizons API')
  })
  it('light time to Mars on 13 Nov 2026 = Horizons distance / c (about 11.1 min)', () => {
    const r = oneWaySeconds('mars', T('2026-11-13T00:00:00Z'))
    expect(r.distanceKm! / 1e6).toBeCloseTo(199.39, 1)
    expect(r.sec / 60).toBeCloseTo(11.08, 1)
  })
  it('Mars one-way delay stays within the 3-23 min range NASA and ESA quote', () => {
    for (let t = T('2021-01-01'); t < T('2040-12-30'); t += 7 * DAY) {
      const m = oneWaySeconds('mars', t).sec / 60
      expect(m).toBeGreaterThan(3)
      expect(m).toBeLessThan(23)
    }
  })
  it('Moon delay is about 1.3 s', () => {
    expect(oneWaySeconds('moon', T('2026-11-13T00:00:00Z')).sec).toBeGreaterThan(1.1)
    expect(oneWaySeconds('moon', T('2026-11-13T00:00:00Z')).sec).toBeLessThan(1.4)
  })
})

describe('solar conjunction blackout (S-O-T < 2 deg, NASA rule)', () => {
  it('reproduces NASA\'s announced 11-25 Nov 2023 command moratorium exactly', () => {
    const s = conjunctionSpans(EPHEMERIS.mars, 2, 1).find((x) => x.start < T('2023-12-01') && x.end > T('2023-11-01'))!
    expect(new Date(s.start).toISOString().slice(0, 10)).toBe('2023-11-11')
    expect(new Date(s.end - DAY).toISOString().slice(0, 10)).toBe('2023-11-25')
  })
  it('matches NASA\'s 2-14/16 Oct 2021 moratorium within 2 days', () => {
    const s = conjunctionSpans(EPHEMERIS.mars, 2, 1).find((x) => x.start < T('2021-11-01') && x.end > T('2021-09-15'))!
    expect(Math.abs(s.start - T('2021-10-02'))).toBeLessThanOrEqual(2 * DAY)
    expect(Math.abs(s.end - DAY - T('2021-10-14'))).toBeLessThanOrEqual(2 * DAY)
  })
  it('has no blackout for the ISS or the Moon', () => {
    expect(blackoutAt('iss', T('2026-01-09'))).toBeNull()
    expect(blackoutAt('moon', T('2026-01-09'))).toBeNull()
  })
})

describe('contact windows and capacity', () => {
  it('ISS is always in contact', () => {
    const s = linkState('iss', T('2026-11-13T10:00:00Z'))
    expect(s.inContact).toBe(true)
    expect(s.capacityBytes).toBeGreaterThan(0)
  })
  it('Mars outside a pass waits for the next pass', () => {
    const s = linkState('mars', T('2026-11-13T09:00:00Z'))
    expect(s.inContact).toBe(false)
    expect(new Date(s.next.start).toISOString()).toBe('2026-11-13T14:00:00.000Z')
    expect(s.capacityBytes).toBe((2e6 / 8) * 6 * 3600) // 6-hour pass at 2 Mbps = 5.4 GB
  })
  it('during the Jan 2026 conjunction the next window is after the blackout', () => {
    const { next } = windowsAround('mars', T('2026-01-09T12:00:00Z'))
    expect(next.start).toBeGreaterThan(T('2026-01-16'))
  })
})

describe('earliest reply and link-aware escalation', () => {
  it('ISS: an answer can come within about a minute', () => {
    const r = earliestReply('iss', T('2026-11-13T10:00:00Z'), 0)
    expect(r.waitMs).toBeLessThan(2_000)
  })
  it('Mars today: at least two light-times (about 22 min) plus ground time', () => {
    const r = earliestReply('mars', T('2026-11-13T15:00:00Z'), 30)
    expect(r.waitMs / 60_000).toBeGreaterThan(22 + 30)
  })
  it('urgent case at Mars switches to the on-board protocol; on the ISS it does not', () => {
    const mars = earliestReply('mars', T('2026-11-13T15:00:00Z'), 30)
    expect(linkAware({ tier: 4, reasons: [] }, mars.waitMs).directive).toBe('onboard-protocol')
    const iss = earliestReply('iss', T('2026-11-13T15:00:00Z'), 5)
    expect(linkAware({ tier: 4, reasons: [] }, iss.waitMs).directive).toBe('follow-tier')
  })
  it('during conjunction even tier 3 cannot wait for Earth', () => {
    const r = earliestReply('mars', T('2026-01-08T12:00:00Z'), 30)
    expect(r.waitMs).toBeGreaterThan(5 * DAY)
    expect(linkAware({ tier: 3, reasons: [] }, r.waitMs).directive).toBe('onboard-protocol')
  })
})
