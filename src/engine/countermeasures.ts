import type { Reading } from './types'

/**
 * Countermeasures tracker (K6). Pure. The target is the mission plan (NASA: 1.5 h/day,
 * six to seven days a week on the ISS), not a medical threshold.
 */
export interface ExercisePlan { minutesPerDay: number; daysPerWeek: number; sourceIds: string[] }
export interface AdherenceDay { date: string; minutes: number | null; metPlan: boolean }
export interface Adherence {
  days: AdherenceDay[]
  daysMeetingPlan: number
  weeklyMinutes: number
  plannedWeeklyMinutes: number
  status: 'normal' | 'watch' | 'unknown'
  reason: string
  sourceIds: string[]
}

const DAY = 86_400_000

export function exerciseAdherence(readings: Reading[], now: string, plan: ExercisePlan): Adherence {
  const end = Date.parse(now)
  const latestPerDay = new Map<string, Reading>()
  for (const r of readings) {
    if (r.indicatorId !== 'exercise_min') continue
    const t = Date.parse(r.takenAt)
    if (t > end || t <= end - 7 * DAY) continue
    const key = String(Math.floor((end - t) / DAY)) // 0 = today, 6 = six days ago
    const prev = latestPerDay.get(key)
    if (!prev || r.takenAt > prev.takenAt) latestPerDay.set(key, r)
  }
  const days: AdherenceDay[] = Array.from({ length: 7 }, (_, i) => {
    const back = 6 - i
    const r = latestPerDay.get(String(back))
    const minutes = r ? r.value : null
    return { date: new Date(end - back * DAY).toISOString().slice(0, 10), minutes, metPlan: minutes !== null && minutes >= plan.minutesPerDay }
  })
  const daysMeetingPlan = days.filter((d) => d.metPlan).length
  const weeklyMinutes = days.reduce((s, d) => s + (d.minutes ?? 0), 0)
  const plannedWeeklyMinutes = plan.minutesPerDay * plan.daysPerWeek
  const label = `mission plan of ${plan.minutesPerDay} min on ${plan.daysPerWeek} days a week`
  if (latestPerDay.size === 0) {
    return { days, daysMeetingPlan, weeklyMinutes, plannedWeeklyMinutes, status: 'unknown', reason: 'No exercise logged in the last 7 days.', sourceIds: plan.sourceIds }
  }
  const met = daysMeetingPlan >= plan.daysPerWeek
  return {
    days, daysMeetingPlan, weeklyMinutes, plannedWeeklyMinutes, sourceIds: plan.sourceIds,
    status: met ? 'normal' : 'watch',
    reason: met
      ? `On plan: ${daysMeetingPlan} of 7 days met the ${label}.`
      : `Below the ${label}: ${daysMeetingPlan} of 7 days met it. This is a mission plan target, not a medical threshold.`,
  }
}
