import { gaussian, hashSeed, mulberry32 } from './prng'
import type { Indicator, Reading, Status } from '../engine/types'

export const SIM_VERSION = '1.0.0'
export const HISTORY_DAYS = 15

export interface CrewBio {
  age: number
  sex: 'F' | 'M'
  heightCm: number
  weightKg: number
  nationality: string
  callsign: string
  specialty: string
  priorFlights: number
  flightDay: number
  missionDays: number
  fitness: 'high' | 'very high'
  chronotype: 'morning' | 'intermediate' | 'evening'
  exerciseRoutine: string
}
export interface CrewMember {
  id: string
  name: string
  role: string
  initials: string
  bio: CrewBio
  profile: Record<string, [number, number]> // indicatorId -> [mean, day-to-day SD]
}
export interface Scenario {
  id: string
  title: string
  summary: string
  crewId?: string
  linkOutage?: boolean
  overrides: Record<string, number[]> // values for the LAST n days of crewId, oldest first
  expected: { crewId: string; overall?: Status; tier?: number; systems?: Record<string, Status> }[]
  anchors?: string[]
}

const PHI = 0.6 // AR(1) day-to-day correlation: engineering assumption

const roundTo = (v: number, step: number) => Math.round(v / step) * step
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v))

/**
 * Deterministic history for one crew member: same scenario + crew + seed -> same values.
 * The last reading lands at `now`; earlier ones one day apart.
 */
export function generateHistory(crew: CrewMember, scenario: Scenario, indicators: Indicator[], now: string, days = HISTORY_DAYS, salt = ''): Reading[] {
  const seed = hashSeed(`${scenario.id}:${crew.id}${salt}`)
  const rand = mulberry32(seed)
  const end = Date.parse(now)
  const out: Reading[] = []
  for (const ind of indicators) {
    const [mean, sd] = crew.profile[ind.id] ?? [ind.default, 0]
    let drift = 0
    const series: number[] = []
    for (let d = 0; d < days; d++) {
      drift = PHI * drift + Math.sqrt(1 - PHI * PHI) * gaussian(rand) * sd
      series.push(mean + drift)
    }
    const ov = scenario.crewId === crew.id ? scenario.overrides[ind.id] : undefined
    if (ov) ov.forEach((v, i) => (series[days - ov.length + i] = v))
    series.forEach((raw, d) => {
      let v = clamp(roundTo(raw, ind.step), ind.plausible)
      v = Math.round(v * 10) / 10
      out.push({
        crewId: crew.id,
        indicatorId: ind.id,
        value: v,
        takenAt: new Date(end - (days - 1 - d) * 86_400_000).toISOString(),
        provenance: { kind: 'simulated', generator: 'asteron-sim', version: SIM_VERSION, seed, scenarioId: scenario.id },
      })
    })
  }
  return out
}
