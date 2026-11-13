import { describe, expect, it } from 'vitest'
import { alertKey, applyFinding, transition, type GroundAlert } from './alerts'

const f = (over: Partial<Parameters<typeof applyFinding>[1]> = {}) => ({
  crewId: 'varga', ruleId: 'comp-infection', status: 'concern' as const, reason: 'Fever with fast heart rate.', bundleId: 'b1', dataCreatedAt: 1000, at: 5000, ...over,
})

describe('ground alert lifecycle (B9): new -> acknowledged -> resolved, deduplicated per crew + rule', () => {
  it('a first finding creates a new alert', () => {
    const { alerts, created } = applyFinding([], f())
    expect(created).toBe(true)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ id: alertKey('varga', 'comp-infection', 5000), state: 'new', status: 'concern', count: 1, bundleIds: ['b1'] })
  })
  it('the same crew + rule while still open updates the alert instead of creating another', () => {
    const a = applyFinding([], f()).alerts
    const { alerts, created } = applyFinding(a, f({ bundleId: 'b2', at: 9000, dataCreatedAt: 8000 }))
    expect(created).toBe(false)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ count: 2, lastSeen: 9000, bundleIds: ['b1', 'b2'], dataCreatedAt: 8000 })
  })
  it('a worse status raises the open alert; a milder one never lowers it', () => {
    let a = applyFinding([], f()).alerts
    a = applyFinding(a, f({ status: 'urgent', bundleId: 'b2', at: 6000 })).alerts
    expect(a[0].status).toBe('urgent')
    a = applyFinding(a, f({ status: 'watch', bundleId: 'b3', at: 7000 })).alerts
    expect(a[0].status).toBe('urgent')
  })
  it('a duplicate bundle does not count twice', () => {
    let a = applyFinding([], f()).alerts
    a = applyFinding(a, f()).alerts
    expect(a[0].count).toBe(1)
  })
  it('after resolution the same rule firing again opens a new alert', () => {
    let a = applyFinding([], f()).alerts
    a = transition(a, a[0].id, 'acknowledged', { at: 6000, actor: 'surgeon' })
    a = transition(a, a[0].id, 'resolved', { at: 7000, actor: 'surgeon', note: 'Advised fluids and rest; recheck in 12 h.' })
    const r = applyFinding(a, f({ bundleId: 'b9', at: 8000 }))
    expect(r.created).toBe(true)
    expect(r.alerts.filter((x: GroundAlert) => x.state !== 'resolved')).toHaveLength(1)
  })
  it('acknowledge then resolve with a note; every step is kept in the alert history', () => {
    let a = applyFinding([], f()).alerts
    a = transition(a, a[0].id, 'acknowledged', { at: 6000, actor: 'surgeon' })
    a = transition(a, a[0].id, 'resolved', { at: 7000, actor: 'surgeon', note: 'Advised fluids and rest.' })
    expect(a[0].state).toBe('resolved')
    expect(a[0].note).toBe('Advised fluids and rest.')
    expect(a[0].history.map((h) => h.state)).toEqual(['new', 'acknowledged', 'resolved'])
  })
  it('resolving needs a note', () => {
    let a = applyFinding([], f()).alerts
    a = transition(a, a[0].id, 'acknowledged', { at: 6000, actor: 'surgeon' })
    expect(() => transition(a, a[0].id, 'resolved', { at: 7000, actor: 'surgeon', note: '  ' })).toThrow(/note/)
  })
  it('steps cannot be skipped or reversed', () => {
    const a = applyFinding([], f()).alerts
    expect(() => transition(a, a[0].id, 'resolved', { at: 7000, actor: 'surgeon', note: 'x y z' })).toThrow(/new -> resolved/)
    const b = transition(a, a[0].id, 'acknowledged', { at: 6000, actor: 'surgeon' })
    expect(() => transition(b, b[0].id, 'new', { at: 7000, actor: 'surgeon' })).toThrow()
  })
  it('an unknown alert id is an error', () => {
    expect(() => transition([], 'nope', 'acknowledged', { at: 1, actor: 'surgeon' })).toThrow(/not found/)
  })
})
