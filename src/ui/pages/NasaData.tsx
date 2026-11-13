import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ANALYTE_ORDER, checkCbc, flightChange, OSD569, TIMEPOINTS } from '../../nasa/cbc'
import { Card } from '../components/Status'

const SUBJECT_COLOR: Record<string, string> = { C001: '#B58BE8', C002: '#3DD6F5', C003: '#EBDDFF', C004: '#8FA8FF' }
const FLAG_UI = {
  low: { label: '▼ Below lab range', cls: 'text-st-watch' },
  high: { label: '▲ Above lab range', cls: 'text-st-watch' },
  suspect: { label: '⚠ Data-quality issue', cls: 'text-mauve' },
  normal: { label: '● In range', cls: 'text-st-normal' },
} as const

export function NasaData() {
  const rows = useMemo(() => checkCbc(OSD569.rows), [])
  const [analyte, setAnalyte] = useState('WHITE BLOOD CELL COUNT')
  const subjects = ['C001', 'C002', 'C003', 'C004']
  const sel = rows.filter((r) => r.analyte === analyte)
  const chart = TIMEPOINTS.map((t) => ({
    t,
    ...Object.fromEntries(subjects.map((s) => {
      const r = sel.find((x) => x.subject === s && x.timepoint === t)
      return [s, r && r.flag !== 'suspect' ? r.value : null]
    })),
  }))
  const ranges = [...new Set(sel.map((r) => `${r.min}-${r.max}`))]
  const [min, max] = [sel[0]?.min, sel[0]?.max]
  const findings = rows.filter((r) => r.flag === 'low' || r.flag === 'high')
  const suspects = rows.filter((r) => r.flag === 'suspect')
  const src = OSD569.source

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Real astronaut data · NASA Open Science Data Repository</p>
        <h1 className="font-display text-3xl font-bold mt-1">Inspiration4 blood counts</h1>
        <p className="text-dust mt-2 max-w-3xl">
          Complete blood counts from the four crew members of {src.mission}, before launch and after return.
          Asteron checks every value against the testing lab's own reference range (included in the file) and runs a data-quality check before reporting anything.
        </p>
        <dl className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          {[
            ['Crew', '4 (C001–C004)'],
            ['Timepoints', TIMEPOINTS.join(' · ')],
            ['Values imported', String(rows.length)],
            ['Outside lab range', `${findings.length} values`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-abyss/70 p-3">
              <dt className="text-xs text-dust uppercase tracking-wider">{k}</dt>
              <dd className="font-mono mt-1 break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-dust mt-3">{src.timepointKey}</p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">Across the flight</h2>
          <label className="text-sm text-dust flex items-center gap-2">
            Analyte
            <select id="analyte" value={analyte} onChange={(e) => setAnalyte(e.target.value)} className="bg-abyss border border-line rounded-lg px-2 py-1 text-star">
              {ANALYTE_ORDER.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
        </div>
        <div className="h-72 mt-4" role="img" aria-label={`${analyte} for four Inspiration4 crew members across seven timepoints`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#2C2342" strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke="#A79FBD" fontSize={12} />
              <YAxis stroke="#A79FBD" fontSize={12} domain={['auto', 'auto']} />
              {ranges.length === 1 && min !== undefined && <ReferenceArea y1={min} y2={max} fill="#22C55E" fillOpacity={0.07} stroke="#22C55E" strokeOpacity={0.3} />}
              <ReferenceArea x1="L-3" x2="R+1" fill="#7B3FE4" fillOpacity={0.12} label={{ value: '3 days in orbit', fill: '#B58BE8', fontSize: 11, position: 'insideTop' }} />
              <Tooltip contentStyle={{ background: '#1A1426', border: '1px solid #2C2342', color: '#F4F1FA' }} />
              <Legend />
              {subjects.map((s) => <Line key={s} type="monotone" dataKey={s} stroke={SUBJECT_COLOR[s]} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-dust mt-2">
          Units: {sel[0]?.units}. {ranges.length === 1 ? `Green band: lab reference range ${ranges[0]}.` : `Reference ranges differ by crew member (${ranges.join(', ')}), so no single band is drawn.`} Values excluded by the data-quality check are left as gaps. Timepoints are evenly spaced, not to time scale.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          {subjects.map((s) => {
            const c = flightChange(rows, s, analyte)
            return <span key={s} className="rounded-lg border border-line px-2 py-1 font-mono" style={{ color: SUBJECT_COLOR[s] }}>{s}: {c ? `${c.before} → ${c.after} (${c.pct >= 0 ? '+' : ''}${c.pct.toFixed(1)}% L-3 → R+1)` : 'n/a'}</span>
          })}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="font-display text-xl font-bold">Values outside the lab range</h2>
          <div className="overflow-x-auto mt-3">
            <table id="nasa-findings" className="w-full text-sm">
              <thead className="text-left text-dust text-xs uppercase tracking-wider"><tr><th className="py-2 pr-3">Crew</th><th className="pr-3">When</th><th className="pr-3">Analyte</th><th className="pr-3">Value</th><th className="pr-3">Lab range</th><th>Flag</th></tr></thead>
              <tbody>
                {findings.map((r) => (
                  <tr key={r.row} className="border-t border-line/60">
                    <td className="py-1.5 pr-3 font-mono">{r.subject}</td><td className="pr-3 font-mono">{r.timepoint}</td><td className="pr-3">{r.analyte}</td>
                    <td className="pr-3 font-mono tabular-nums">{r.value}</td><td className="pr-3 font-mono text-dust">{r.min}–{r.max}</td>
                    <td className={FLAG_UI[r.flag].cls}>{FLAG_UI[r.flag].label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-dust mt-3">Flags compare a value with the lab's reference range only. They are not a diagnosis.</p>
        </Card>
        <Card>
          <h2 className="font-display text-xl font-bold">Data-quality check</h2>
          <p className="text-sm text-dust mt-2">
            {suspects.length} values in sample {suspects[0]?.subject} {suspects[0]?.timepoint} look like a one-row shift in the source file: each value fits the range of the analyte listed just before it.
            Asteron excludes them instead of raising false alarms.
          </p>
          <ul id="nasa-suspects" className="mt-3 flex flex-col gap-1.5 text-xs font-mono">
            {suspects.map((r) => (
              <li key={r.row} className="text-dust"><span className="text-mauve">line {r.row}</span> · {r.analyte} = {r.value} (range {r.min}–{r.max})</li>
            ))}
          </ul>
          {suspects[0]?.note && <p className="text-xs text-mauve mt-3">{suspects[0].note}</p>}
        </Card>
      </div>

      <Card>
        <h2 className="font-display text-lg font-bold">Source</h2>
        <ul className="text-sm text-dust mt-2 flex flex-col gap-1">
          <li>Study: <a className="text-mauve hover:underline" href={src.url} target="_blank" rel="noreferrer">NASA OSDR {src.study}</a> · file <span className="font-mono">{src.file}</span></li>
          <li>SHA-256 of the file used: <span className="font-mono break-all">{src.sha256}</span> (imported {src.importedAt}, values unchanged)</li>
          <li>{src.consent}</li>
          <li>Inspiration4 was a 3-day free-flying mission with a civilian crew, not a long ISS stay. Blood counts are shown here as real reference data; they do not feed the daily vital-sign engine.</li>
        </ul>
      </Card>
    </div>
  )
}
