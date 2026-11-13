import { describe, expect, it } from 'vitest'
import { content } from '../../content'
import { summarizeDose, type DoseRecord } from '../radiation'

const LIM = content.radiation.limits
const day = (i: number) => new Date(Date.UTC(2026, 6, 1) + i * 86_400_000).toISOString()
const SIM = { kind: 'simulated', generator: 'asteron-sim', version: 't', seed: 1, scenarioId: 't' } as const
const gcr = (n: number, msv: number, crewId = 'c1'): DoseRecord[] =>
  Array.from({ length: n }, (_, i) => ({ crewId, takenAt: day(i), doseMsv: msv, kind: 'gcr', provenance: SIM }))

const base = { crewId: 'c1', priorMsv: 0, flightDay: 100, missionDays: 180, limits: LIM }

describe('radiation dose tracker (K2): NASA career limit 600 mSv, SPE limit 250 mSv', () => {
  it('adds mission dose to prior career dose and reports the share of the 600 mSv limit', () => {
    const s = summarizeDose({ ...base, priorMsv: 100, records: gcr(100, 0.5) })
    expect(s.missionMsv).toBeCloseTo(50, 6)
    expect(s.careerMsv).toBeCloseTo(150, 6)
    expect(s.careerLimitMsv).toBe(600)
    expect(s.careerFraction).toBeCloseTo(0.25, 6)
    expect(s.status).toBe('normal')
    expect(s.sourceIds).toContain('nasa-ochmo-radiation-brief')
  })

  it('projects to mission end from the average daily dose so far (labelled an engineering assumption)', () => {
    const s = summarizeDose({ ...base, records: gcr(100, 0.5) })
    expect(s.dailyAvgMsv).toBeCloseTo(0.5, 6)
    expect(s.projectedCareerMsv).toBeCloseTo(90, 6) // 50 so far + 80 days x 0.5
    expect(s.reasons.join(' ')).toMatch(/assumption/i)
  })

  it('watch when the projection reaches the career limit before mission end (never more than watch)', () => {
    const s = summarizeDose({ ...base, priorMsv: 520, records: gcr(100, 0.5) }) // 570 now, 610 projected
    expect(s.careerMsv).toBeCloseTo(570, 6)
    expect(s.status).toBe('watch')
  })

  it('concern once the career dose reaches the published limit', () => {
    const s = summarizeDose({ ...base, priorMsv: 560, records: gcr(100, 0.5) }) // 610
    expect(s.status).toBe('concern')
    expect(s.reasons.join(' ')).toMatch(/V1 4030/)
  })

  it('concern when one solar particle event reaches the 250 mSv event limit', () => {
    const records: DoseRecord[] = [...gcr(10, 0.3), { crewId: 'c1', takenAt: day(10), doseMsv: 260, kind: 'spe', provenance: SIM }]
    const s = summarizeDose({ ...base, records })
    expect(s.largestSpeMsv).toBe(260)
    expect(s.status).toBe('concern')
    expect(s.reasons.join(' ')).toMatch(/V1 4031/)
  })

  it('unknown when there are no dosimeter records (never shown as normal)', () => {
    const s = summarizeDose({ ...base, records: [] })
    expect(s.status).toBe('unknown')
  })

  it('ignores other crew members and readings after now', () => {
    const s = summarizeDose({ ...base, now: day(5), records: [...gcr(10, 1), ...gcr(10, 9, 'other')] })
    expect(s.missionMsv).toBeCloseTo(6, 6) // days 0..5
  })

  it('rejects a negative dose (dosimeter error)', () => {
    expect(() => summarizeDose({ ...base, records: [{ crewId: 'c1', takenAt: day(0), doseMsv: -1, kind: 'gcr', provenance: SIM }] })).toThrow(/negative/)
  })
})

describe('solar particle event estimates per profile (NASA NTRS 20250006168, October 1989 event)', () => {
  it('moon and mars have published shielded estimates; mars also unshielded', () => {
    const spe = content.radiation.speEventEstimateMsv
    expect(spe.moon).toMatchObject({ shielded: 100 })
    expect(spe.mars).toMatchObject({ shielded: 25, unshielded: 40 })
    expect(spe.moon.sourceIds).toContain('nasa-ntrs-20250006168')
  })
})
