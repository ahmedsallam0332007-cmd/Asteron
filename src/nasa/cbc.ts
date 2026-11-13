import data from '../content/nasa/osd569-cbc.json'

export interface CbcRow {
  row: number
  subject: string
  sex: string
  timepoint: string
  phase: 'pre' | 'post'
  days: number
  analyte: string
  value: number
  min: number
  max: number
  units: string
}
export type CbcFlag = 'low' | 'normal' | 'high' | 'suspect'
export interface CheckedRow extends CbcRow { flag: CbcFlag; note?: string }

export const OSD569 = data as { source: Record<string, string>; rows: CbcRow[] }

/** Lab panel order. A missing row shifts every later value up by one analyte. */
export const ANALYTE_ORDER = [
  'WHITE BLOOD CELL COUNT', 'RED BLOOD CELL COUNT', 'HEMOGLOBIN', 'HEMATOCRIT', 'MCV', 'MCH', 'MCHC', 'RDW',
  'PLATELET COUNT', 'MPV', 'ABSOLUTE NEUTROPHILS', 'ABSOLUTE LYMPHOCYTES', 'ABSOLUTE MONOCYTES',
  'ABSOLUTE EOSINOPHILS', 'ABSOLUTE BASOPHILS', 'NEUTROPHILS', 'LYMPHOCYTES', 'MONOCYTES', 'EOSINOPHILS', 'BASOPHILS',
]
export const TIMEPOINTS = ['L-92', 'L-44', 'L-3', 'R+1', 'R+45', 'R+82', 'R+194']

const inRange = (v: number, min: number, max: number) => v >= min && v <= max

/**
 * Range check against the lab's own reference range (from the file), plus a data-quality pass:
 * if 3+ values in one sample are out of their own range but each fits the range of the analyte
 * just before it in the panel, the sample is flagged as a suspected one-row shift and those
 * values are NOT reported as medical findings.
 */
export function checkCbc(rows: CbcRow[]): CheckedRow[] {
  const rangeOf = new Map<string, [number, number]>()
  for (const r of rows) rangeOf.set(`${r.subject}|${r.analyte}`, [r.min, r.max])
  const bySample = new Map<string, CbcRow[]>()
  for (const r of rows) {
    const k = `${r.subject}|${r.timepoint}`
    bySample.set(k, [...(bySample.get(k) ?? []), r])
  }
  const out: CheckedRow[] = []
  for (const sample of bySample.values()) {
    const shifted = new Set<number>()
    for (const r of sample) {
      const i = ANALYTE_ORDER.indexOf(r.analyte)
      if (i <= 0 || inRange(r.value, r.min, r.max)) continue
      const prev = rangeOf.get(`${r.subject}|${ANALYTE_ORDER[i - 1]}`)
      if (prev && inRange(r.value, prev[0], prev[1])) shifted.add(r.row)
    }
    const suspect = shifted.size >= 3
    const present = new Set(sample.map((r) => r.analyte))
    const missing = ANALYTE_ORDER.filter((a) => !present.has(a))
    for (const r of sample) {
      if (suspect && shifted.has(r.row)) {
        const i = ANALYTE_ORDER.indexOf(r.analyte)
        out.push({ ...r, flag: 'suspect', note: `Value fits the range of ${ANALYTE_ORDER[i - 1]}. Likely a one-row shift in the source file${missing.length ? ` (missing row: ${missing.join(', ')})` : ''}. Not reported as a finding. Other values in this sample may also be affected.` })
      } else if (r.value < r.min) out.push({ ...r, flag: 'low' })
      else if (r.value > r.max) out.push({ ...r, flag: 'high' })
      else out.push({ ...r, flag: 'normal' })
    }
  }
  return out.sort((a, b) => a.row - b.row)
}

/** Percent change from the last pre-flight sample (L-3) to the first after return (R+1). */
export function flightChange(rows: CheckedRow[], subject: string, analyte: string) {
  const pick = (t: string) => rows.find((r) => r.subject === subject && r.analyte === analyte && r.timepoint === t && r.flag !== 'suspect')
  const a = pick('L-3'), b = pick('R+1')
  if (!a || !b) return null
  return { before: a.value, after: b.value, pct: ((b.value - a.value) / a.value) * 100 }
}
