import { content } from '../content'
import { CREW, generateHistory, SCENARIOS } from '../sim'
import type { Provenance, Reading } from '../engine/types'
import type { StationDB } from './db'

export interface PendingSensor { value: number; provenance: Provenance }
/** crewId -> indicatorId -> today's simulated sensor value (not yet a check-in). */
export type PendingToday = Record<string, Record<string, PendingSensor>>

/**
 * Seeds a scenario. Only PAST days are stored as readings (the history the
 * baseline and trend rules need). Today's simulated sensor values are kept
 * aside: nothing is assessed for today until a check-in is submitted.
 */
export async function seedScenario(db: StationDB, scenarioId: string, now: string) {
  const sc = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]
  const nowMs = Date.parse(now)
  const history: Reading[] = []
  const pending: PendingToday = {}
  for (const c of CREW) {
    for (const r of generateHistory(c, sc, content.indicators, now)) {
      if (Date.parse(r.takenAt) === nowMs) {
        pending[c.id] ??= {}
        pending[c.id][r.indicatorId] = { value: r.value, provenance: r.provenance! }
      } else history.push(r)
    }
  }
  await db.transaction('rw', db.readings, db.settings, async () => {
    await db.readings.clear()
    await db.readings.bulkAdd(history)
    await db.settings.put({ key: 'scenario', value: { id: sc.id, seededAt: now } })
    await db.settings.put({ key: 'pendingToday', value: pending })
  })
  return { scenario: sc, count: history.length }
}

/** Seeds the healthy scenario on first launch only. */
export async function ensureSeeded(db: StationDB, now: string) {
  if ((await db.readings.count()) === 0) await seedScenario(db, 'healthy', now)
}
