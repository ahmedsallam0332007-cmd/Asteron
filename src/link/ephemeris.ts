import ephJson from '../content/nasa/ephemeris.json'

type Row = [string, number, number] // date, delta AU, S-O-T deg
interface EphFile { source: Record<string, unknown> & { au_km: number }; mars: { rows: Row[]; sha256: string; url: string }; moon: { rows: Row[]; sha256: string; url: string } }
const eph = ephJson as unknown as EphFile
const AU_KM = eph.source.au_km
const DAY = 86_400_000

export interface Geometry { distanceKm: number; sotDeg: number; date: string }
export interface EphemerisTable { rows: Row[]; first: number }

export const EPHEMERIS: Record<'mars' | 'moon', EphemerisTable> = {
  mars: { rows: eph.mars.rows, first: Date.parse(eph.mars.rows[0][0]) },
  moon: { rows: eph.moon.rows, first: Date.parse(eph.moon.rows[0][0]) },
}
export const EPHEMERIS_SOURCE = eph.source
export const EPHEMERIS_SHA = { mars: eph.mars.sha256, moon: eph.moon.sha256 }

/** Linear interpolation between JPL Horizons daily rows (00:00 UT). Null outside 2021–2040. */
export function geometryAt(table: EphemerisTable, t: number): Geometry | null {
  const x = (t - table.first) / DAY
  const i = Math.floor(x)
  if (i < 0 || i >= table.rows.length - 1) return null
  const f = x - i
  const [d0, a0, s0] = table.rows[i]
  const [, a1, s1] = table.rows[i + 1]
  return { distanceKm: (a0 + (a1 - a0) * f) * AU_KM, sotDeg: s0 + (s1 - s0) * f, date: d0 }
}

/** Days (00:00 UT rows) where S-O-T is below maxDeg, grouped into spans, each widened by bufferDays. */
export function conjunctionSpans(table: EphemerisTable, maxDeg: number, bufferDays: number) {
  const spans: { start: number; end: number; minSot: number }[] = []
  let cur: { start: number; end: number; minSot: number } | null = null
  table.rows.forEach(([d, , sot]) => {
    const t = Date.parse(d)
    if (sot < maxDeg) {
      if (!cur) cur = { start: t, end: t, minSot: sot }
      else { cur.end = t; cur.minSot = Math.min(cur.minSot, sot) }
    } else if (cur) { spans.push(cur); cur = null }
  })
  return spans.map((s) => ({ start: s.start - bufferDays * DAY, end: s.end + (bufferDays + 1) * DAY, minSot: s.minSot }))
}
