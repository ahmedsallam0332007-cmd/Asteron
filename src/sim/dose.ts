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
