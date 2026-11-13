import { hashSeed, mulberry32 } from './prng'
import { content } from '../content'
import type { DoseRecord } from '../engine/radiation'
import type { CrewMember } from './generator'
import { SIM_VERSION } from './generator'

export type DoseProfile = 'iss' | 'moon' | 'mars'

/**
 * Simulated dosimeter: one daily (galactic cosmic ray) dose per day, drawn uniformly inside
 * NASA's published daily range for the profile (NTRS 20250006168). Deterministic per crew + profile.
 * Where in the range a day falls is a simulation choice, not a measurement.
 */
export function generateDose(crew: CrewMember, profile: DoseProfile, now: string, days: number): DoseRecord[] {
  const { low, high } = content.radiation.dailyDoseMsv[profile]
  const seed = hashSeed(`dose:${profile}:${crew.id}`)
  const rand = mulberry32(seed)
  const end = Date.parse(now)
  return Array.from({ length: days }, (_, d) => ({
    crewId: crew.id,
    takenAt: new Date(end - (days - 1 - d) * 86_400_000).toISOString(),
    doseMsv: Math.round((low + (high - low) * rand()) * 1000) / 1000,
    kind: 'gcr' as const,
    provenance: { kind: 'simulated' as const, generator: 'asteron-dosimeter', version: SIM_VERSION, seed, scenarioId: `dose-${profile}` },
  }))
}

/**
 * Dose from one solar particle event, using NASA's published estimate for the October 1989 event
 * (NTRS 20250006168, Table 1). Returns null where our sources publish no value: no number is invented.
 */
export function speDose(profile: DoseProfile, sheltered: boolean): { doseMsv: number; label: string; sourceIds: string[] } | null {
  const est = content.radiation.speEventEstimateMsv
  if (profile === 'mars') {
    return sheltered
      ? { doseMsv: est.mars.shielded, label: 'Sheltered (10 g/cm2 water-equivalent shield), NASA estimate for the October 1989 event', sourceIds: est.mars.sourceIds }
      : { doseMsv: est.mars.unshielded, label: 'Not sheltered (planet and atmosphere only), NASA estimate for the October 1989 event', sourceIds: est.mars.sourceIds }
  }
  if (profile === 'moon') {
    return { doseMsv: est.moon.shielded, label: 'Shielded estimate (10 g/cm2) for the October 1989 event; NASA publishes no unsheltered lunar value in our sources', sourceIds: est.moon.sourceIds }
  }
  return null
}
