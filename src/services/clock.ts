/**
 * Mission clock. Mission time = anchor + (real time since anchor) x compression.
 * Compression is always shown on screen (a Mars light-time of 12 min can play in 12 s at 60x).
 * Pure functions: the real time is passed in.
 */
export interface ClockState { missionAt: number; realAt: number; compression: number }

export const clockAt = (c: ClockState, realNow: number) => c.missionAt + (realNow - c.realAt) * c.compression

export function rebase(c: ClockState, realNow: number, change: { compression?: number; jumpTo?: number }): ClockState {
  const now = clockAt(c, realNow)
  const compression = change.compression ?? c.compression
  if (!Number.isFinite(compression) || compression < 1) throw new Error('Compression must be a finite number of at least 1')
  if (change.jumpTo !== undefined && change.jumpTo < now) throw new Error('The mission clock never runs backwards')
  return { missionAt: change.jumpTo ?? now, realAt: realNow, compression }
}
