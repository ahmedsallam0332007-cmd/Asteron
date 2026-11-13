import { median } from '../engine/stats'
import type { Reading } from '../engine/types'
import { content } from '../content'

/** Median of each indicator's last 7 readings, rounded to the indicator's step. */
export function usualValues(readings: Reading[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const ind of content.indicators) {
    const vals = readings.filter((r) => r.indicatorId === ind.id).sort((a, b) => a.takenAt.localeCompare(b.takenAt)).slice(-8, -1).map((r) => r.value)
    if (vals.length) out[ind.id] = Math.round(Math.round(median(vals) / ind.step) * ind.step * 10) / 10
  }
  return out
}
