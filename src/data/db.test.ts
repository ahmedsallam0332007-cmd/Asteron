import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { StationDB } from './db'
import { seedScenario } from './seed'

describe('station db', () => {
  it('seeds a scenario and replaces the previous one', async () => {
    const db = new StationDB('test-station')
    const now = '2026-11-13T08:00:00.000Z'
    const a = await seedScenario(db, 'healthy', now)
    expect(a.count).toBe(6 * 8 * 15)
    await seedScenario(db, 'urgent', now)
    expect(await db.readings.count()).toBe(6 * 8 * 15)
    const s = await db.settings.get('scenario')
    expect((s?.value as { id: string }).id).toBe('urgent')
    db.close()
  })
})
