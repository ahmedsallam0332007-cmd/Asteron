import { useState } from 'react'
import { Link } from 'react-router-dom'
import { content } from '../../../content'
import { stationDb } from '../../../data/db'
import { checkedInToday, saveCheckIn, validate } from '../../../data/checkin'
import { useCrewReadings, usePendingToday } from '../../../data/hooks'
import { assess } from '../../../engine'
import type { Provenance, Reading } from '../../../engine/types'
import { useApp } from '../../../store/app'
import { CREW } from '../../../sim'
import { usualValues } from '../../../lib/usual'
import { Card, ProvenanceBadge, StatusBadge } from '../../components/Status'
import { AnchorNote } from '../../components/Anchor'

type Analysis = { readings: Reading[]; at: string; result: ReturnType<typeof assess>; counts: Record<string, number> }

const MANUAL: Provenance = { kind: 'manual', enteredBy: 'crew' }

/** Remount the form per crew member so edits and analysis never leak between crew. */
export function CheckIn() {
  const crewId = useApp((s) => s.crewId)
  return <CheckInForm key={crewId} />
}

function CheckInForm() {
  const { crewId, setCrew, now: appNow } = useApp()
  const crew = CREW.find((c) => c.id === crewId)!
  const history = useCrewReadings(crewId)
  const pendingAll = usePendingToday()
  const pending = pendingAll?.[crewId]
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [step, setStep] = useState(0)

  const usual = usualValues(history ?? [])
  const prefill = (id: string) => (pending?.[id] ? String(pending[id].value) : String(usual[id] ?? content.indicators.find((i) => i.id === id)!.default))
  const values = Object.fromEntries(content.indicators.map((i) => [i.id, edited[i.id] ?? prefill(i.id)]))
  const provenanceOf = (id: string): Provenance =>
    pending?.[id] && (edited[id] === undefined || Number(edited[id]) === pending[id].value) ? pending[id].provenance : MANUAL

  const last = history?.reduce<string | undefined>((m, r) => (!m || r.takenAt > m ? r.takenAt : m), undefined)
  const doneToday = checkedInToday(last, appNow)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const plausible = Object.fromEntries(content.indicators.map((i) => [i.id, i.plausible])) as Record<string, [number, number]>
    const { errors, parsed } = validate(values, plausible)
    setErrors(errors)
    if (Object.keys(errors).length) return
    const now = new Date().toISOString()
    const saved = await saveCheckIn(stationDb, crewId, parsed, now, provenanceOf)
    useApp.getState().setNow(now)
    const all = await stationDb.readings.where('crewId').equals(crewId).toArray()
    const counts = saved.reduce<Record<string, number>>((m, r) => ({ ...m, [r.provenance!.kind]: (m[r.provenance!.kind] ?? 0) + 1 }), {})
    setAnalysis({ readings: all, at: now, result: assess(content, all, now), counts })
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) setStep(5)
    else { setStep(1); [2, 3, 4, 5].forEach((s, i) => setTimeout(() => setStep(s), 280 * (i + 1))) }
  }

  const fired = analysis?.result.evaluations.flatMap((e) => e.fired) ?? []
  const firedUnique = [...new Map(fired.map((f) => [f.ruleId, f])).values()]
  const tier = analysis && content.tiers.find((t) => t.tier === analysis.result.tier.tier)!
  const priorDays = analysis ? new Set(analysis.readings.filter((r) => r.takenAt < analysis.at).map((r) => r.takenAt.slice(0, 10))).size : 0

  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-mauve">Daily check-in</p>
            <h1 className="font-display text-2xl font-bold mt-1">How are you today?</h1>
          </div>
          <label className="text-sm text-dust flex items-center gap-2">
            Crew
            <select id="checkin-crew" value={crewId} onChange={(e) => setCrew(e.target.value)} className="bg-abyss border border-line rounded-lg px-2 py-1 text-star">
              {CREW.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-dust mt-2">
          {pending
            ? 'Pre-filled with today\'s simulated sensor values (SIM). Change any field to enter your own measurement: it is then recorded as MANUAL.'
            : 'Pre-filled with this crew member\'s usual values. Change what you measured today.'}
          {doneToday && !analysis && ' A check-in was already saved today; submitting again replaces it.'}
        </p>
        <form onSubmit={submit} className="mt-5 grid sm:grid-cols-2 gap-4" noValidate>
          {content.indicators.map((ind) => (
            <div key={ind.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`f-${ind.id}`} className="text-sm font-semibold flex items-center gap-2">
                  {ind.label} <ProvenanceBadge p={provenanceOf(ind.id)} />
                </label>
                <button type="button" className="text-xs text-mauve hover:underline whitespace-nowrap" aria-expanded={open === ind.id} onClick={() => setOpen(open === ind.id ? null : ind.id)}>
                  How to measure
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id={`f-${ind.id}`}
                  name={ind.id}
                  inputMode="decimal"
                  value={values[ind.id]}
                  onChange={(e) => { setEdited({ ...edited, [ind.id]: e.target.value }); setAnalysis(null); setStep(0) }}
                  aria-invalid={!!errors[ind.id]}
                  aria-describedby={errors[ind.id] ? `e-${ind.id}` : undefined}
                  className={`w-full rounded-lg bg-abyss border px-3 py-2 font-mono tabular-nums ${errors[ind.id] ? 'border-st-urgent' : 'border-line focus:border-mauve'}`}
                />
                <span className="text-dust text-sm w-12">{ind.unit}</span>
              </div>
              <AnchorNote indicatorId={ind.id} compact />
              {open === ind.id && <p className="text-xs text-dust bg-abyss rounded-lg p-2 border border-line">{ind.howToMeasure}</p>}
              {errors[ind.id] && <p id={`e-${ind.id}`} className="text-xs text-st-urgent">{errors[ind.id]}</p>}
            </div>
          ))}
          <div className="sm:col-span-2">
            <button type="submit" id="analyze" className="rounded-xl bg-asteron px-5 py-2.5 font-semibold text-white hover:bg-asteron/85">
              Save and analyse
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-mauve">Analysis</p>
        {!analysis ? (
          <div id="analysis-empty" className="mt-3 text-dust text-sm flex flex-col gap-2">
            <p>Not analysed yet.</p>
            <p>Submit today's check-in for {crew.name}. The engine then compares each reading with published ranges, with this person's own usual values from previous days, and with the last 3 days' trend.</p>
          </div>
        ) : (
          <ol id="analysis-steps" className="mt-3 flex flex-col gap-3 text-sm" aria-live="polite">
            {step >= 1 && (
              <li>✓ {Object.values(analysis.counts).reduce((a, b) => a + b, 0)} readings saved{' '}
                <span className="text-dust">({Object.entries(analysis.counts).map(([k, n]) => `${n} ${k === 'simulated' ? 'SIM' : k.toUpperCase()}`).join(', ')})</span></li>
            )}
            {step >= 2 && <li>✓ Personal baseline from {priorDays} previous days</li>}
            {step >= 3 && <li>✓ {content.rules.length} rules evaluated · <span className="font-semibold">{firedUnique.length} fired</span></li>}
            {step >= 4 && (
              <li>
                <ul className="flex flex-col gap-2">
                  {firedUnique.length === 0 && <li className="text-dust">No rule fired. All readings in range.</li>}
                  {firedUnique.map((f) => <li key={f.ruleId} className="border-l-2 border-mauve pl-3 text-dust"><span className="font-mono text-mauve text-xs">{f.ruleId}</span><br />{f.reason}</li>)}
                </ul>
              </li>
            )}
            {step >= 5 && tier && (
              <li id="analysis-result" className="rounded-xl border border-line bg-abyss p-3">
                <div className="flex items-center gap-3"><span className="font-display text-lg font-bold">{crew.name}</span><StatusBadge status={analysis.result.overall.status} /></div>
                <p className="mt-1">Tier {tier.tier} · {tier.label}</p>
                <div className="mt-2 flex gap-3 text-mauve">
                  <Link to="/station" className="hover:underline">Dashboard →</Link>
                  <Link to="/station/report" className="hover:underline">Report →</Link>
                </div>
              </li>
            )}
          </ol>
        )}
      </Card>
    </div>
  )
}
