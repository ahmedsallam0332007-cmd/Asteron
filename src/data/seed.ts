import { content } from '../content'
import { CREW, generateHistory, SCENARIOS } from '../sim'
import type { StationDB } from './db'

/** Replaces all station readings with a fresh, deterministic scenario history ending at `now`. */
export async function seedScenario(db: StationDB, scenarioId: string, now: string) {
  const sc = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]
  const readings = CREW.flatMap((c) => generateHistory(c, sc, content.indicators, now))
  await db.transaction('rw', db.readings, db.settings, async () => {
    await db.readings.clear()
    await db.readings.bulkAdd(readings)
    await db.settings.put({ key: 'scenario', value: { id: sc.id, seededAt: now } })
  })
  return { scenario: sc, count: readings.length }
}

/** Seeds the healthy scenario on first launch only. */
export async function ensureSeeded(db: StationDB, now: string) {
  if ((await db.readings.count()) === 0) await seedScenario(db, 'healthy', now)
}
