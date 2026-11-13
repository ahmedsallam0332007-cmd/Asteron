import type { Reading } from './types'

export const DAY_MS = 86_400_000
export const BASELINE_WINDOW = 14

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export interface Baseline { median: number; mad: number; n: number }

/** Median and MAD of up to BASELINE_WINDOW readings taken before `latest`. Null if fewer than minDays. */
export function baselineOf(series: Reading[], latest: Reading, minDays: number): Baseline | null {
  const prior = series.filter((r) => r.takenAt < latest.takenAt).slice(-BASELINE_WINDOW)
  if (prior.length < minDays) return null
  const values = prior.map((r) => r.value)
  const med = median(values)
  return { median: med, mad: median(values.map((v) => Math.abs(v - med))), n: prior.length }
}

/** How many MADs `value` is from the baseline median. MAD is floored to avoid divide-by-zero. */
export const deviation = (value: number, b: Baseline, madFloor: number): number =>
  (value - b.median) / Math.max(b.mad, madFloor)
