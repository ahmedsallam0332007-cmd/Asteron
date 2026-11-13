import { C_KM_S, PROFILES, type ProfileId } from './profiles'
import { conjunctionSpans, EPHEMERIS, geometryAt } from './ephemeris'

const H = 3_600_000
const DAY = 24 * H

export interface Window { start: number; end: number }
export interface LinkState {
  profile: ProfileId
  now: number
  oneWaySec: number
  distanceKm: number | null
  sotDeg: number | null
  blackout: { start: number; end: number } | null
  inContact: boolean
  current: Window | null
  next: Window
  /** Bytes that fit in the next (or current remaining) window at the profile's rate. */
  capacityBytes: number
}

const blackoutCache = new Map<ProfileId, { start: number; end: number }[]>()
function blackouts(id: ProfileId) {
  const p = PROFILES[id]
  if (!p.conjunction) return []
  if (!blackoutCache.has(id)) blackoutCache.set(id, conjunctionSpans(EPHEMERIS.mars, p.conjunction.maxSotDeg, p.conjunction.bufferDays))
  return blackoutCache.get(id)!
}
export const blackoutAt = (id: ProfileId, t: number) => blackouts(id).find((b) => t >= b.start && t < b.end) ?? null

export function oneWaySeconds(id: ProfileId, t: number): { sec: number; distanceKm: number | null; sotDeg: number | null } {
  const p = PROFILES[id]
  if (p.fixedOneWaySec !== undefined) return { sec: p.fixedOneWaySec, distanceKm: null, sotDeg: null }
  const g = geometryAt(EPHEMERIS[id === 'moon' ? 'moon' : 'mars'], t)
  if (!g) throw new Error(`No JPL Horizons data for ${id} at ${new Date(t).toISOString()} (covered: 2021–2040)`)
  return { sec: g.distanceKm / C_KM_S, distanceKm: g.distanceKm, sotDeg: g.sotDeg }
}

/** Contact windows of one UTC day, minus any blackout. */
function windowsOfDay(id: ProfileId, dayStart: number): Window[] {
  const s = PROFILES[id].schedule
  if (s.kind === 'continuous') return [{ start: dayStart, end: dayStart + DAY }]
  return s.startsUtcHour.map((h) => ({ start: dayStart + h * H, end: dayStart + h * H + s.hours * H }))
}

/** Current window (if in contact) and the next one, skipping solar-conjunction blackouts. */
export function windowsAround(id: ProfileId, t: number): { current: Window | null; next: Window } {
  let day = Math.floor(t / DAY) * DAY
  let current: Window | null = null
  for (let i = 0; i < 400; i++) {
    for (const w of windowsOfDay(id, day)) {
      const b = blackoutAt(id, w.start) ?? blackoutAt(id, w.end - 1)
      if (b) continue
      if (!current && t >= w.start && t < w.end) { current = w; continue }
      if (w.start >= t && (!current || w.start >= current.end)) return { current, next: w }
    }
    day += DAY
  }
  throw new Error('No contact window found within 400 days')
}

export function linkState(id: ProfileId, now: number): LinkState {
  const lt = oneWaySeconds(id, now)
  const { current, next } = windowsAround(id, now)
  const rate = PROFILES[id].rateBps
  const capacityWindow = current ? current.end - now : next.end - next.start
  return {
    profile: id,
    now,
    oneWaySec: lt.sec,
    distanceKm: lt.distanceKm,
    sotDeg: lt.sotDeg,
    blackout: blackoutAt(id, now),
    inContact: !!current,
    current,
    next,
    capacityBytes: Math.floor((rate / 8) * (capacityWindow / 1000)),
  }
}

/**
 * Earliest time the crew can receive an answer to a message written at `now`:
 * wait for a window, signal travels down, the ground team takes `groundMinutes` (assumption),
 * the answer travels up and must arrive inside a window.
 */
export function earliestReply(id: ProfileId, now: number, groundMinutes = 30) {
  const { current, next } = windowsAround(id, now)
  const sendAt = current ? now : next.start
  const down = oneWaySeconds(id, sendAt).sec * 1000
  const replySent = sendAt + down + groundMinutes * 60_000
  const up = oneWaySeconds(id, replySent).sec * 1000
  const arrives = replySent + up
  const w = windowsAround(id, arrives)
  const receivedAt = w.current ? arrives : w.next.start
  return { sendAt, arrivesGround: sendAt + down, replySent, receivedAt, waitMs: receivedAt - now }
}
