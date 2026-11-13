import { describe, expect, it } from 'vitest'
import { content } from '../../content'
import { exerciseAdherence } from '../countermeasures'
import { adaptationPhase } from '../adaptation'
import type { Reading } from '../types'

const NOW = '2026-11-13T08:00:00.000Z'
const ex = (mins: (number | null)[]): Reading[] =>
  mins.flatMap((m, i) => (m === null ? [] : [{ crewId: 'c1', indicatorId: 'exercise_min', value: m, takenAt: new Date(Date.parse(NOW) - (mins.length - 1 - i) * 86_400_000).toISOString() }]))
const PLAN = content.mission.exercisePlan

describe('countermeasures tracker (K6): exercise against the mission plan of 90 min on 6 days a week', () => {
  it('counts the last 7 days and the days that met the plan', () => {
    const a = exerciseAdherence(ex([90, 95, 100, 92, 91, 0, 96]), NOW, PLAN)
    expect(a.days).toHaveLength(7)
    expect(a.daysMeetingPlan).toBe(6)
    expect(a.weeklyMinutes).toBe(564)
    expect(a.plannedWeeklyMinutes).toBe(540)
    expect(a.status).toBe('normal')
  })
  it('watch when fewer days than the plan met the target, and says it is a mission plan, not a medical threshold', () => {
    const a = exerciseAdherence(ex([90, 60, 100, 45, 91, 0, 96]), NOW, PLAN)
    expect(a.daysMeetingPlan).toBe(4)
    expect(a.status).toBe('watch')
    expect(a.reason).toMatch(/mission plan/i)
  })
  it('a missing day counts as not meeting the plan', () => {
    const a = exerciseAdherence(ex([90, 95, null, 92, 91, 93, 96]), NOW, PLAN)
    expect(a.days.find((d) => d.minutes === null)).toBeDefined()
    expect(a.daysMeetingPlan).toBe(6)
  })
  it('unknown with no exercise logged in the last 7 days', () => {
    expect(exerciseAdherence([], NOW, PLAN).status).toBe('unknown')
  })
  it('only the last reading of a day counts (a re-entered check-in replaces the earlier one)', () => {
    const r = ex([90, 90, 90, 90, 90, 90, 30])
    r.push({ ...r[r.length - 1], value: 95, takenAt: new Date(Date.parse(NOW) + 60_000).toISOString() })
    const a = exerciseAdherence(r, new Date(Date.parse(NOW) + 120_000).toISOString(), PLAN)
    expect(a.days[6].minutes).toBe(95)
  })
})

describe('adaptation phase (~45 days, NASA podcast, Dr. Crucian)', () => {
  const D = content.mission.adaptationDays
  it('flight day 20 is inside the phase with 25 days left', () => {
    expect(adaptationPhase(20, D)).toMatchObject({ inPhase: true, daysLeft: 25 })
  })
  it('flight day 45 is the last day; 46 is outside', () => {
    expect(adaptationPhase(45, D).inPhase).toBe(true)
    expect(adaptationPhase(46, D)).toMatchObject({ inPhase: false, daysLeft: 0 })
  })
  it('explains itself and cites the source', () => {
    const p = adaptationPhase(10, D)
    expect(p.text).toMatch(/baseline/i)
    expect(p.sourceIds).toContain('nasa-hwhap-hazard5')
  })
  it('rejects a flight day below 1', () => {
    expect(() => adaptationPhase(0, D)).toThrow()
  })
})
