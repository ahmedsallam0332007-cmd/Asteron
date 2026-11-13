import { describe, expect, it } from 'vitest'
import { content } from '../content'
import { CREW } from './index'
import { generateDose } from './dose'

const NOW = '2026-11-13T08:00:00.000Z'

describe('simulated dosimetry: deterministic and inside NASA\'s published daily range', () => {
  for (const profile of ['iss', 'moon', 'mars'] as const) {
    it(`${profile}: every daily dose is within the published range`, () => {
      const { low, high } = content.radiation.dailyDoseMsv[profile]
      for (const c of CREW) {
        const recs = generateDose(c, profile, NOW, 30)
        expect(recs).toHaveLength(30)
        for (const r of recs) {
          expect(r.doseMsv).toBeGreaterThanOrEqual(low)
          expect(r.doseMsv).toBeLessThanOrEqual(high)
          expect(r.provenance.kind).toBe('simulated')
          expect(r.kind).toBe('gcr')
        }
      }
    })
  }
  it('same crew, profile and day count give the same doses', () => {
    expect(generateDose(CREW[0], 'mars', NOW, 10)).toEqual(generateDose(CREW[0], 'mars', NOW, 10))
  })
  it('the last record is at now, one per day before it', () => {
    const r = generateDose(CREW[0], 'iss', NOW, 3)
    expect(r.map((x) => x.takenAt)).toEqual(['2026-11-11T08:00:00.000Z', '2026-11-12T08:00:00.000Z', NOW])
  })
})
