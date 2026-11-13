import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { StationDB } from './db'
import { seedScenario } from './seed'
import { saveCheckIn, validate } from './checkin'

describe('check-in', () => {
  it('validates numbers and plausible ranges', () => {
    const p: Record<string, [number, number]> = { hr_rest: [30, 220], temp: [34, 42] }
    expect(validate({ hr_rest: '72', temp: '36.8' }, p)).toEqual({ errors: {}, parsed: { hr_rest: 72, temp: 36.8 } })
    expect(Object.keys(validate({ hr_rest: '', temp: '50' }, p).errors)).toEqual(['hr_rest', 'temp'])
    expect(validate({ hr_rest: 'abc', temp: '36' }, p).errors.hr_rest).toBe('Enter a number.')
  })
  it('replaces today\'s reading instead of adding a duplicate', async () => {
    const db = new StationDB('ci-test')
    const now = '2026-11-13T08:00:00.000Z'
    await seedScenario(db, 'healthy', now)
    const before = await db.readings.count()
    await saveCheckIn(db, 'rahal', { hr_rest: 80 }, '2026-11-13T09:00:00.000Z', { kind: 'manual', enteredBy: 'crew' })
    expect(await db.readings.count()).toBe(before)
    const hr = await db.readings.where('crewId').equals('rahal').filter((r) => r.indicatorId === 'hr_rest').sortBy('takenAt')
    expect(hr[hr.length - 1]).toMatchObject({ value: 80, provenance: { kind: 'manual' } })
    db.close()
  })
})
