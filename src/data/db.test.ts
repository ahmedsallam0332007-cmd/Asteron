import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { StationDB } from './db'
import { seedScenario } from './seed'

describe('station db', () => {
  it('seeds a scenario and replaces the previous one', async () => {
    const db = new StationDB('test-station')
    const now = '2026-11-13T08:00:00.000Z'
    const a = await seedScenario(db, 'healthy', now)
    expect(a.count).toBe(6 * 8 * 14) // history only: today waits for a check-in
    await seedScenario(db, 'urgent', now)
    expect(await db.readings.count()).toBe(6 * 8 * 14)
    const pending = (await db.settings.get('pendingToday'))?.value as Record<string, Record<string, unknown>>
    expect(Object.keys(pending)).toHaveLength(6)
    expect(Object.keys(pending.rahal)).toHaveLength(8)
    const latest = (await db.readings.orderBy('takenAt').last())!.takenAt
    expect(Date.parse(now) - Date.parse(latest)).toBe(86_400_000)
    const s = await db.settings.get('scenario')
    expect((s?.value as { id: string } | undefined)?.id).toBe('urgent')
    db.close()
  })
})
