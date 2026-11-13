import { describe, expect, it } from 'vitest'
import { checkCbc, flightChange, OSD569 } from './cbc'

const rows = checkCbc(OSD569.rows)
const find = (s: string, t: string, a: string) => rows.find((r) => r.subject === s && r.timepoint === t && r.analyte === a)!

describe('NASA OSD-569 Inspiration4 CBC', () => {
  it('imports every row unchanged with provenance', () => {
    expect(OSD569.rows).toHaveLength(553)
    expect(OSD569.source.sha256).toBe('10a878b009eb2ea11a13fe92ad698098858639e8ed02f5ee849431313b9457d3')
    expect(new Set(OSD569.rows.map((r) => r.subject))).toEqual(new Set(['C001', 'C002', 'C003', 'C004']))
  })
  it('flags real out-of-range values against the lab\'s own ranges', () => {
    expect(find('C002', 'L-3', 'HEMOGLOBIN')).toMatchObject({ value: 11.5, flag: 'low' })
    expect(find('C004', 'R+1', 'ABSOLUTE MONOCYTES')).toMatchObject({ value: 1029, flag: 'high' })
    expect(find('C001', 'L-92', 'HEMOGLOBIN').flag).toBe('normal')
  })
  it('detects the one-row shift in C003 L-92 and does not report it as findings', () => {
    const sample = rows.filter((r) => r.subject === 'C003' && r.timepoint === 'L-92')
    const suspect = sample.filter((r) => r.flag === 'suspect').map((r) => r.analyte)
    expect(suspect).toEqual(expect.arrayContaining(['MCHC', 'RDW', 'PLATELET COUNT', 'MPV', 'ABSOLUTE NEUTROPHILS']))
    expect(find('C003', 'L-92', 'PLATELET COUNT').note).toContain('MCH')
    expect(sample.filter((r) => r.flag === 'low' || r.flag === 'high')).toEqual([])
  })
  it('splits the 16 raw out-of-range values into 8 real findings and 8 data-quality exclusions', () => {
    expect(rows.filter((r) => r.flag === 'low' || r.flag === 'high')).toHaveLength(8)
    expect(rows.filter((r) => r.flag === 'suspect')).toHaveLength(8)
  })
  it('does not flag shifts in clean samples', () => {
    expect(rows.filter((r) => r.flag === 'suspect' && !(r.subject === 'C003' && r.timepoint === 'L-92'))).toEqual([])
  })
  it('computes the change across the flight', () => {
    const c = flightChange(rows, 'C001', 'WHITE BLOOD CELL COUNT')!
    expect(c.before).toBe(find('C001', 'L-3', 'WHITE BLOOD CELL COUNT').value)
    expect(c.after).toBe(find('C001', 'R+1', 'WHITE BLOOD CELL COUNT').value)
  })
})
