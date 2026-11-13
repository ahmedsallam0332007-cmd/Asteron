import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { StationDB } from './db'
import { seedScenario } from './seed'
import { checkedInToday, saveCheckIn, validate } from './checkin'

describe('check-in', () => {
  it('validates numbers and plausible ranges', () => {
    const p: Record<string, [number, number]> = { hr_rest: [30, 220], temp: [34, 42] }
    expect(validate({ hr_rest: '72', temp: '36.8' }, p)).toEqual({ errors: {}, parsed: { hr_rest: 72, temp: 36.8 } })
    expect(Object.keys(validate({ hr_rest: '', temp: '50' }, p).errors)).toEqual(['hr_rest', 'temp'])
    expect(validate({ hr_rest: 'abc', temp: '36' }, p).errors.hr_rest).toBe('Enter a number.')
  })
  it('adds today and replaces a second check-in the same day instead of duplicating', async () => {
    const db = new StationDB('ci-test')
    const now = '2026-11-13T08:00:00.000Z'
    await seedScenario(db, 'healthy', now)
    const before = await db.readings.count()
    await saveCheckIn(db, 'rahal', { hr_rest: 75 }, '2026-11-13T08:30:00.000Z', { kind: 'manual', enteredBy: 'crew' })
    expect(await db.readings.count()).toBe(before + 1)
    await saveCheckIn(db, 'rahal', { hr_rest: 80 }, '2026-11-13T09:00:00.000Z', { kind: 'manual', enteredBy: 'crew' })
    expect(await db.readings.count()).toBe(before + 1)
    const hr = await db.readings.where('crewId').equals('rahal').filter((r) => r.indicatorId === 'hr_rest').sortBy('takenAt')
    expect(hr[hr.length - 1]).toMatchObject({ value: 80, provenance: { kind: 'manual' } })
    db.close()
  })
  it('records provenance per field', async () => {
    const db = new StationDB('ci-prov')
    await seedScenario(db, 'healthy', '2026-11-13T08:00:00.000Z')
    const sim = { kind: 'simulated', generator: 'asteron-sim', version: '1', seed: 1, scenarioId: 'healthy' } as const
    await saveCheckIn(db, 'moreau', { hr_rest: 70, temp: 36.6 }, '2026-11-13T08:10:00.000Z', (id) => (id === 'temp' ? { kind: 'manual', enteredBy: 'crew' } : sim))
    const today = await db.readings.where('crewId').equals('moreau').filter((r) => r.takenAt === '2026-11-13T08:10:00.000Z').toArray()
    expect(Object.fromEntries(today.map((r) => [r.indicatorId, r.provenance?.kind]))).toEqual({ hr_rest: 'simulated', temp: 'manual' })
    db.close()
  })
  it('knows whether a crew member checked in today', () => {
    expect(checkedInToday(undefined, '2026-11-13T08:00:00.000Z')).toBe(false)
    expect(checkedInToday('2026-11-12T08:00:00.000Z', '2026-11-13T08:00:00.000Z')).toBe(false)
    expect(checkedInToday('2026-11-13T07:00:00.000Z', '2026-11-13T08:00:00.000Z')).toBe(true)
  })
})
