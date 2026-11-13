import { useState } from 'react'
import { Link } from 'react-router-dom'
import { content } from '../../../content'
import { stationDb } from '../../../data/db'
import { saveCheckIn, validate } from '../../../data/checkin'
import { useAssessment } from '../../../data/hooks'
import { useApp } from '../../../store/app'
import { CREW } from '../../../sim'
import { Card, StatusBadge } from '../../components/Status'
import { usualValues } from '../../../lib/usual'

export function CheckIn() {
  const { crewId, setCrew } = useApp()
  const crew = CREW.find((c) => c.id === crewId)!
  const a = useAssessment(crewId)
  const usual = usualValues(a?.readings ?? [])
  const [edited, setValues] = useState<Record<string, string>>({})
  const values: Record<string, string> = Object.fromEntries(
    content.indicators.map((i) => [i.id, edited[i.id] ?? String(usual[i.id] ?? i.default)]),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const plausible = Object.fromEntries(content.indicators.map((i) => [i.id, i.plausible])) as Record<string, [number, number]>
    const { errors, parsed } = validate(values, plausible)
    setErrors(errors)
    if (Object.keys(errors).length) return
    const now = new Date().toISOString()
    await saveCheckIn(stationDb, crewId, parsed, now, { kind: 'manual', enteredBy: 'crew' })
    useApp.getState().setNow(now)
    setSaved(true)
  }

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
            <select id="checkin-crew" value={crewId} onChange={(e) => { setCrew(e.target.value); setValues({}); setSaved(false) }} className="bg-abyss border border-line rounded-lg px-2 py-1 text-star">
              {CREW.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-dust mt-2">Pre-filled with this crew member's usual values (median of the last 7 days). Change what you measured today.</p>
        <form onSubmit={submit} className="mt-5 grid sm:grid-cols-2 gap-4" noValidate>
          {content.indicators.map((ind) => (
            <div key={ind.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor={`f-${ind.id}`} className="text-sm font-semibold">{ind.label}</label>
                <button type="button" className="text-xs text-mauve hover:underline" aria-expanded={open === ind.id} onClick={() => setOpen(open === ind.id ? null : ind.id)}>
                  How to measure
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id={`f-${ind.id}`}
                  name={ind.id}
                  inputMode="decimal"
                  value={values[ind.id]}
                  onChange={(e) => { setValues({ ...edited, [ind.id]: e.target.value }); setSaved(false) }}
                  aria-invalid={!!errors[ind.id]}
                  aria-describedby={errors[ind.id] ? `e-${ind.id}` : undefined}
                  className={`w-full rounded-lg bg-abyss border px-3 py-2 font-mono tabular-nums ${errors[ind.id] ? 'border-st-urgent' : 'border-line focus:border-mauve'}`}
                />
                <span className="text-dust text-sm w-12">{ind.unit}</span>
              </div>
              {open === ind.id && <p className="text-xs text-dust bg-abyss rounded-lg p-2 border border-line">{ind.howToMeasure}</p>}
              {errors[ind.id] && <p id={`e-${ind.id}`} className="text-xs text-st-urgent">{errors[ind.id]}</p>}
            </div>
          ))}
          <div className="sm:col-span-2 flex items-center gap-3">
            <button type="submit" className="rounded-xl bg-asteron px-5 py-2.5 font-semibold text-white hover:bg-asteron/85">Save check-in</button>
            {saved && <span role="status" className="text-sm text-st-normal">Saved for {crew.name}. Results updated.</span>}
          </div>
        </form>
      </Card>
      <Card>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-mauve">Result</p>
        {a ? (
          <>
            <div className="flex items-center gap-3 mt-2"><span className="font-display text-xl font-bold">{crew.name}</span><StatusBadge status={a.overall.status as never} /></div>
            <p className="text-sm text-dust mt-1">Escalation tier {a.tier.tier}</p>
            <ul className="mt-4 flex flex-col gap-2">
              {a.evaluations.flatMap((e) => e.fired).slice(0, 6).map((f, i) => (
                <li key={i} className="text-sm border-l-2 border-mauve pl-3 text-dust">{f.reason}</li>
              ))}
              {!a.evaluations.some((e) => e.fired.length) && <li className="text-sm text-dust">No rule fired. All readings in range.</li>}
            </ul>
            <Link to="/station" className="inline-block mt-4 text-mauve text-sm hover:underline">Open dashboard →</Link>
          </>
        ) : <p className="text-dust">Loading…</p>}
      </Card>
    </div>
  )
}
