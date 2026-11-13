import type { Provenance, Status } from './types'

/**
 * Radiation dose tracker (K2). Pure: the clock is `now`.
 * Only NASA's published limits decide a status above `watch`:
 *  - career effective dose < 600 mSv (NASA-STD-3001 V1 4030)
 *  - one solar particle event < 250 mSv (NASA-STD-3001 V1 4031)
 * The end-of-mission projection is an engineering assumption and is capped at `watch`.
 */
export interface DoseRecord {
  crewId: string
  takenAt: string
  doseMsv: number
  /** gcr = daily background dose; spe = one solar particle event. */
  kind: 'gcr' | 'spe'
  provenance: Provenance
}

interface Limit { value: number; clause: string; sourceIds: string[] }
export interface DoseInput {
  crewId: string
  priorMsv: number
  records: DoseRecord[]
  flightDay: number
  missionDays: number
  limits: { careerMsv: Limit; speEventMsv: Limit }
  now?: string
}

export interface DoseSummary {
  crewId: string
  priorMsv: number
  missionMsv: number
  careerMsv: number
  careerLimitMsv: number
  careerFraction: number
  dailyAvgMsv: number
  projectedCareerMsv: number
  largestSpeMsv: number
  speCount: number
  status: Exclude<Status, 'urgent'>
  reasons: string[]
  sourceIds: string[]
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function summarizeDose(input: DoseInput): DoseSummary {
  const { careerMsv: career, speEventMsv: spe } = input.limits
  const cutoff = input.now ?? '9999'
  const mine = input.records.filter((r) => r.crewId === input.crewId && r.takenAt <= cutoff)
  for (const r of mine) if (!(r.doseMsv >= 0)) throw new Error(`Dosimeter record at ${r.takenAt} has a negative or invalid dose (${r.doseMsv} mSv)`)

  const sourceIds = [...new Set([...career.sourceIds, ...spe.sourceIds])]
  const missionMsv = mine.reduce((s, r) => s + r.doseMsv, 0)
  const careerMsv = input.priorMsv + missionMsv
  const gcrDays = new Set(mine.filter((r) => r.kind === 'gcr').map((r) => r.takenAt.slice(0, 10))).size
  const gcrSum = mine.filter((r) => r.kind === 'gcr').reduce((s, r) => s + r.doseMsv, 0)
  const dailyAvgMsv = gcrDays ? gcrSum / gcrDays : 0
  const daysLeft = Math.max(0, input.missionDays - input.flightDay)
  const projectedCareerMsv = careerMsv + dailyAvgMsv * daysLeft
  const speDoses = mine.filter((r) => r.kind === 'spe').map((r) => r.doseMsv)
  const largestSpeMsv = speDoses.length ? Math.max(...speDoses) : 0

  const base = {
    crewId: input.crewId, priorMsv: input.priorMsv, missionMsv, careerMsv, careerLimitMsv: career.value,
    careerFraction: careerMsv / career.value, dailyAvgMsv, projectedCareerMsv, largestSpeMsv, speCount: speDoses.length, sourceIds,
  }
  if (mine.length === 0) {
    return { ...base, status: 'unknown', reasons: ['No dosimeter records yet. The dose is unknown, not zero.'] }
  }

  const reasons: string[] = [`Career dose ${r1(careerMsv)} mSv of the ${career.value} mSv NASA limit (${career.clause}): ${Math.round((careerMsv / career.value) * 100)}%.`]
  let status: DoseSummary['status'] = 'normal'
  if (careerMsv >= career.value) {
    status = 'concern'
    reasons.push(`At or above NASA's career limit (${career.clause}). The flight surgeon must review further exposure.`)
  }
  if (largestSpeMsv >= spe.value) {
    status = 'concern'
    reasons.push(`One solar particle event gave ${r1(largestSpeMsv)} mSv, at or above NASA's ${spe.value} mSv event limit (${spe.clause}).`)
  }
  if (status === 'normal' && projectedCareerMsv >= career.value) {
    status = 'watch'
    reasons.push(`Projected to reach the limit before mission end (${r1(projectedCareerMsv)} mSv).`)
  }
  reasons.push(`Projection: average daily dose so far (${dailyAvgMsv.toFixed(2)} mSv/day) x ${daysLeft} days left. Engineering assumption, not a NASA method.`)
  return { ...base, status, reasons }
}
