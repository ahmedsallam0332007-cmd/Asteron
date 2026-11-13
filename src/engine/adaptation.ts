/**
 * Adaptation phase. NASA immunologist Dr. Brian Crucian describes an early adaptation phase of
 * about 45 days, then a "space normal" state. A personal baseline formed in that phase is still settling.
 */
export interface AdaptationSetting { value: number; sourceIds: string[] }
export interface AdaptationPhase { inPhase: boolean; flightDay: number; daysLeft: number; text: string; sourceIds: string[] }

export function adaptationPhase(flightDay: number, setting: AdaptationSetting): AdaptationPhase {
  if (!Number.isInteger(flightDay) || flightDay < 1) throw new Error(`Flight day must be a whole number from 1 (got ${flightDay})`)
  const inPhase = flightDay <= setting.value
  return {
    inPhase,
    flightDay,
    daysLeft: inPhase ? setting.value - flightDay : 0,
    sourceIds: setting.sourceIds,
    text: inPhase
      ? `Flight day ${flightDay} of the ~${setting.value}-day adaptation phase: the personal baseline is still settling, so alerts that compare with "usual" are less certain.`
      : `Past the ~${setting.value}-day adaptation phase: the personal baseline reflects this crew member's "space normal".`,
  }
}
