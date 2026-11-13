import { describe, expect, it } from 'vitest'
import { buildHandover, heatmap } from './handover'
import type { CrewOverview } from './node'
import type { GroundAlert } from './alerts'

const NOW = Date.parse('2026-11-13T20:00:00Z')
const ov = (o: Partial<CrewOverview>): CrewOverview => ({
  crewId: 'rahal', name: 'Cmdr. Nadia Rahal', shownStatus: 'normal', lastKnownStatus: 'normal', stale: false, dataAgeMs: 3_600_000,
  lastContactAt: NOW - 3_600_000, tier: 1, directive: 'follow-tier', systems: { brain: 'normal', cardio: 'normal', resp: 'normal', metabolic: 'normal', msk: 'normal', immune: 'normal' }, openAlerts: 0, ...o,
})
const alert = (o: Partial<GroundAlert>): GroundAlert => ({
  id: 'a1', crewId: 'varga', ruleId: 'comp-infection', status: 'concern', state: 'new', reason: 'Fever with a fast heart rate.',
  firstSeen: NOW - 7_200_000, lastSeen: NOW - 7_200_000, dataCreatedAt: NOW - 7_300_000, count: 1, bundleIds: ['b'], history: [], ...o,
})

describe('daily handover report (K4)', () => {
  const crew = [ov({}), ov({ crewId: 'varga', name: 'Spc. Varga', shownStatus: 'concern', lastKnownStatus: 'concern', tier: 3, openAlerts: 1, systems: { immune: 'concern', cardio: 'concern' } }),
    ov({ crewId: 'okafor', name: 'Dr. Okafor', shownStatus: 'unknown', lastKnownStatus: null, stale: true, dataAgeMs: null, tier: null, directive: null, systems: {} }),
    ov({ crewId: 'haddad', name: 'Eng. Haddad', directive: 'onboard-protocol', tier: 4, shownStatus: 'urgent', lastKnownStatus: 'urgent' })]
  const r = buildHandover({ now: NOW, crew, alerts: [alert({}), alert({ id: 'a2', state: 'resolved', note: 'done' })], rejected: 2, auditOk: true, profile: 'mars' })
  it('lists every crew member, worst first, with the age of the data', () => {
    expect(r.crew.map((c) => c.crewId)).toEqual(['haddad', 'varga', 'okafor', 'rahal'])
    expect(r.text).toMatch(/Spc\. Varga.*CONCERN.*data 1\.0 h old/)
  })
  it('never shows stale data as current', () => {
    expect(r.text).toMatch(/Dr\. Okafor: UNKNOWN \(no data received\)/)
  })
  it('lists open alerts only, and flags crew acting on the on-board protocol', () => {
    expect(r.openAlerts.map((a) => a.id)).toEqual(['a1'])
    expect(r.text).toMatch(/Eng\. Haddad.*on-board protocol/)
  })
  it('reports link security: rejected bundles and the audit chain', () => {
    expect(r.text).toMatch(/Rejected bundles: 2/)
    expect(r.text).toMatch(/Audit chain: intact/)
  })
  it('carries the disclaimer', () => {
    expect(r.text).toMatch(/not a medical diagnosis/)
  })
})

describe('crew heatmap (K3)', () => {
  it('rows are crew, columns are the six systems; stale crew show unknown in every cell', () => {
    const h = heatmap([ov({}), ov({ crewId: 'okafor', stale: true, systems: { brain: 'watch' } })])
    expect(h.columns).toEqual(['brain', 'cardio', 'resp', 'metabolic', 'msk', 'immune'])
    expect(h.rows[0].cells.map((c) => c.status)).toEqual(['normal', 'normal', 'normal', 'normal', 'normal', 'normal'])
    expect(h.rows[1].cells.every((c) => c.status === 'unknown')).toBe(true)
  })
})
