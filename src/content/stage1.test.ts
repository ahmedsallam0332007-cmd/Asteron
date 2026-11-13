import { describe, expect, it } from 'vitest'
import { content, sourceById } from './index'
import { CREW } from '../sim'

const ind = (id: string) => content.indicators.find((i) => i.id === id)
const rule = (id: string) => content.rules.find((r) => r.id === id)

describe('stage 1: psychological stress and workload (NASA HRP risks 12, 14)', () => {
  it('stress and workload are 1-5 self-report indicators on the brain system', () => {
    for (const id of ['stress', 'workload']) {
      const i = ind(id)
      expect(i, id).toBeDefined()
      expect(i!.plausible).toEqual([1, 5])
      expect(i!.systems).toContain('brain')
      expect(i!.sourceIds).toContain('nasa-hrp-risks')
    }
  })
  it('stress and workload are judged only against the personal baseline (no invented absolute threshold)', () => {
    const abs = content.rules.filter((r) => r.type === 'absolute' && (r.indicatorIds.includes('stress') || r.indicatorIds.includes('workload')))
    expect(abs).toEqual([])
    expect(rule('base-stress-high')?.type).toBe('baseline')
    expect(rule('base-workload-high')?.type).toBe('baseline')
  })
  it('overload composite: workload above usual together with sleep below usual', () => {
    const r = rule('comp-overload')
    expect(r?.type).toBe('composite')
    if (r?.type !== 'composite') return
    expect(r.params.conditions.map((c) => `${c.indicatorId}:${c.kind}`).sort()).toEqual(['sleep_h:baselineBelow', 'workload:baselineAbove'])
    expect(r.sourceIds).toContain('nasa-hrp-risks')
  })
})

describe('stage 1: symptom check (NASA HRP risks 1, 2, 6, 10)', () => {
  const SYM = ['sym_headache', 'sym_rash', 'sym_dizzy', 'sym_vision']
  it('each symptom is a yes/no indicator (0 or 1)', () => {
    for (const id of SYM) {
      expect(ind(id)?.plausible, id).toEqual([0, 1])
      expect(ind(id)?.step, id).toBe(1)
      expect(ind(id)?.default, id).toBe(0)
    }
  })
  it('each symptom has a rule that fires when present, citing NASA HRP risks', () => {
    for (const id of SYM) {
      const r = content.rules.find((x) => x.type === 'absolute' && x.indicatorIds[0] === id)
      expect(r, id).toBeDefined()
      if (r?.type !== 'absolute') continue
      expect(r.params).toEqual({ op: 'gte', value: 1 })
      expect(r.sourceIds).toContain('nasa-hrp-risks')
    }
  })
  it('a vision change asks the flight surgeon to review (SANS): concern, at least tier 3', () => {
    const r = rule('abs-sym-vision')
    expect(r?.resultStatus).toBe('concern')
    expect(r?.minTier).toBe(3)
  })
  it('headache with stress above usual points at cabin air first (CO2), citing the NASA environments podcast', () => {
    const r = rule('comp-cabin-air')
    expect(r?.type).toBe('composite')
    expect(r?.sourceIds).toContain('nasa-hwhap-hazard5')
    expect(r?.message).toMatch(/CO2|carbon dioxide/i)
  })
})

describe('stage 1: radiation content (NASA-STD-3001 via OCHMO, NASA NTRS 20250006168)', () => {
  it('career limit 600 mSv and solar-particle-event limit 250 mSv, with the standard clause', () => {
    expect(content.radiation.limits.careerMsv).toEqual({ value: 600, clause: 'V1 4030', sourceIds: ['nasa-ochmo-radiation-brief'] })
    expect(content.radiation.limits.speEventMsv).toEqual({ value: 250, clause: 'V1 4031', sourceIds: ['nasa-ochmo-radiation-brief'] })
  })
  it('published daily dose ranges per mission profile', () => {
    const r = content.radiation.dailyDoseMsv
    expect(r.iss).toMatchObject({ low: 0.2, high: 0.5 })
    expect(r.moon).toMatchObject({ low: 0.4, high: 0.9 })
    expect(r.mars).toMatchObject({ low: 0.35, high: 0.65 })
    for (const k of ['iss', 'moon', 'mars'] as const) expect(r[k].sourceIds).toContain('nasa-ntrs-20250006168')
  })
  it('the radiation sources were checked against the original documents and carry their SHA-256', () => {
    for (const id of ['nasa-ochmo-radiation-brief', 'nasa-ntrs-20250006168']) {
      const s = sourceById(id)
      expect(s?.verifiedAgainstOriginal, id).toBe(true)
      expect(s?.sha256, id).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})

describe('stage 1: countermeasures and mission settings', () => {
  it('exercise plan: 90 min/day on at least 6 days/week (NASA HRP risk 9), labelled a mission plan setting', () => {
    expect(content.mission.exercisePlan).toMatchObject({ minutesPerDay: 90, daysPerWeek: 6, kind: 'mission-plan-setting' })
    expect(content.mission.exercisePlan.sourceIds).toContain('nasa-hrp-risks')
  })
  it('immune adaptation phase of about 45 days (NASA podcast, Dr. Crucian), labelled an estimate', () => {
    expect(content.mission.adaptationDays).toMatchObject({ value: 45, kind: 'estimate' })
    expect(content.mission.adaptationDays.sourceIds).toContain('nasa-hwhap-hazard5')
  })
})

describe('stage 1: simulation covers every indicator', () => {
  it('every crew member has a profile for every indicator', () => {
    for (const c of CREW) for (const i of content.indicators) expect(c.profile[i.id], `${c.id}.${i.id}`).toBeDefined()
  })
  it('every crew member has a prior career dose (fictional, from the bio)', () => {
    for (const c of CREW) expect(c.bio.priorCareerDoseMsv).toBeGreaterThanOrEqual(0)
  })
})
