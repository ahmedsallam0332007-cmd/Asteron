import type { Provenance, Reading } from '../engine/types'
import type { StationDB } from './db'

const TWELVE_H = 12 * 3_600_000

/**
 * Saves one check-in. Readings taken in the last 12 h for the same crew and
 * indicator are replaced, so a day keeps one value per indicator (the baseline
 * and trend rules assume one reading per day).
 */
export async function saveCheckIn(db: StationDB, crewId: string, values: Record<string, number>, now: string, provenance: Provenance) {
  const cutoff = new Date(Date.parse(now) - TWELVE_H).toISOString()
  const readings: Reading[] = Object.entries(values).map(([indicatorId, value]) => ({ crewId, indicatorId, value, takenAt: now, provenance }))
  await db.transaction('rw', db.readings, async () => {
    const old = await db.readings.where('crewId').equals(crewId).filter((r) => r.takenAt >= cutoff && r.indicatorId in values).primaryKeys()
    await db.readings.bulkDelete(old)
    await db.readings.bulkAdd(readings)
  })
  return readings
}

export function validate(values: Record<string, string>, plausible: Record<string, [number, number]>) {
  const errors: Record<string, string> = {}
  const parsed: Record<string, number> = {}
  for (const [id, raw] of Object.entries(values)) {
    const v = Number(raw)
    const [lo, hi] = plausible[id]
    if (raw.trim() === '' || !Number.isFinite(v)) errors[id] = 'Enter a number.'
    else if (v < lo || v > hi) errors[id] = `Must be between ${lo} and ${hi}. Re-check the measurement.`
    else parsed[id] = v
  }
  return { errors, parsed }
}
