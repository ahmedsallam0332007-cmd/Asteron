import { lazy, Suspense, useMemo, useState } from 'react'
import { content } from '../../content'
import { assess } from '../../engine'
import type { Reading, Status, SystemId } from '../../engine/types'
import { useCrewReadings } from '../../data/hooks'
import { usualValues } from '../../lib/usual'
import { earliestReply } from '../../link/contactPlan'
import { GROUND_RESPONSE_MIN, linkAware } from '../../link/escalation'
import { CREW } from '../../sim'
import { useSystem } from '../../store/system'
import { Card, StatusBadge } from '../components/Status'
import { cardsFrom } from '../body/cards'

const Body3D = lazy(() => import('../body/Body3D').then((m) => ({ default: m.Body3D })))
const PRESETS: Record<string, Record<string, number>> = {
  'Severe infection': { temp: 38.6, hr_rest: 112, spo2: 91 },
  'Sleep and overload': { sleep_h: 5.2, workload: 5, stress: 4 },
  'Cabin CO2 pattern': { sym_headache: 1, stress: 4 },
  'Vision change (SANS)': { sym_vision: 1 },
  'High blood pressure': { bp_sys: 146, bp_dia: 92 },
}

export function JudgeLab() {
  const status = useSystem((s) => s.status)
  const sys = useSystem((s) => s.system)
  const profile = useSystem((s) => s.profile)
  const now = useSystem((s) => s.missionNow)
  const [crewId, setCrewId] = useState('rahal')
  const history = useCrewReadings(crewId)
  const usual = useMemo(() => usualValues(history ?? []), [history])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [sent, setSent] = useState<string | null>(null)
  const values = useMemo(() => Object.fromEntries(content.indicators.map((i) => [i.id, edits[i.id] ?? String(usual[i.id] ?? i.default)])), [edits, usual])
  const nowIso = new Date(now).toISOString()

  const live = useMemo(() => {
    if (!history) return null
    const typed: Reading[] = content.indicators.flatMap((i) => {
      const v = Number(values[i.id])
      return Number.isFinite(v) && v >= i.plausible[0] && v <= i.plausible[1] ? [{ crewId, indicatorId: i.id, value: v, takenAt: nowIso, provenance: { kind: 'judge' as const, enteredAt: nowIso } }] : []
    })
    const past = history.filter((r) => Date.parse(r.takenAt) < now - 12 * 3_600_000)
    const a = assess(content, [...past, ...typed], nowIso)
    let link = null
    try { link = linkAware(a.tier, earliestReply(profile, now, GROUND_RESPONSE_MIN[a.tier.tier]).waitMs) } catch { link = null }
    return { a, link, invalid: content.indicators.filter((i) => !typed.some((t) => t.indicatorId === i.id)).map((i) => i.id) }
  }, [history, values, crewId, nowIso, profile, now])

  if (status !== 'ready' || !live) return <p className="text-dust">Starting…</p>
  const fired = [...new Map(live.a.evaluations.flatMap((e) => e.fired).map((f) => [f.ruleId, f])).values()]

  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow">Judge Lab · simulate the problem before it happens</p>
        <h1 className="font-display text-3xl font-bold mt-1">Type your own readings. Watch the engine decide.</h1>
        <p className="text-dust mt-1 max-w-[75ch]">The same engine as the station, live as you type. It compares your values with published thresholds and with this astronaut’s own last 14 days. Values you type are badged JUDGE. Nothing is saved until you send it.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select id="lab-crew" value={crewId} onChange={(e) => { setCrewId(e.target.value); setEdits({}); setSent(null) }} className="bg-abyss/80 border border-line rounded-lg px-3 py-2 text-star">
          {CREW.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {Object.entries(PRESETS).map(([k, v]) => <button key={k} className="btn btn-sm" onClick={() => setEdits(Object.fromEntries(Object.entries(v).map(([a, b]) => [a, String(b)])))}>{k}</button>)}
        <button className="btn btn-sm" onClick={() => setEdits({})}>Back to usual</button>
      </div>
      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <Card>
          <div className="grid sm:grid-cols-2 gap-3">
            {content.indicators.map((i) => (
              <label key={i.id} className="text-sm grid gap-1">
                <span className="text-dust">{i.label}{i.unit && ` (${i.unit})`}</span>
                <input id={`lab-${i.id}`} inputMode="decimal" value={values[i.id]} onChange={(e) => setEdits({ ...edits, [i.id]: e.target.value })}
                  className={`bg-abyss/80 border rounded-lg px-3 py-1.5 font-mono ${live.invalid.includes(i.id) ? 'border-st-urgent' : edits[i.id] !== undefined ? 'border-mauve' : 'border-line'}`} />
                {live.invalid.includes(i.id) && <span className="text-xs text-st-urgent">Must be {i.plausible[0]}–{i.plausible[1]}</span>}
              </label>
            ))}
          </div>
          <button id="lab-send" className="btn btn-primary mt-4" disabled={live.invalid.length > 0 || !sys}
            onClick={async () => { const r = await sys!.station.submitCheckIn({ crewId, values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])), provenance: () => ({ kind: 'judge', enteredAt: nowIso }), now }); setSent(`Sent as ${crewId}'s check-in: tier ${r.assessment.tier.tier}, ${r.queued.map((q) => q.kind).join(' + ')} sealed and queued for Earth.`) }}>
            Send as a JUDGE check-in
          </button>
          {sent && <p id="lab-sent" className="mt-2 text-sm text-st-normal">{sent}</p>}
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl font-bold">Result, live</h2><StatusBadge status={live.a.overall.status} size="lg" /></div>
          <p id="lab-tier" className="mt-1">Tier {live.a.tier.tier} · {content.tiers.find((t) => t.tier === live.a.tier.tier)!.label}</p>
          {live.link && <p id="lab-link" className={`mt-2 rounded-lg border px-3 py-2 text-sm ${live.link.directive === 'onboard-protocol' ? 'border-st-watch/50 text-st-watch' : 'border-line text-dust'}`}>{live.link.directive === 'onboard-protocol' ? '⚠ On-board protocol now. ' : '✓ Earth can answer in time. '}{live.link.explanation}</p>}
          <Suspense fallback={null}><Body3D cards={cardsFrom(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])))} systems={Object.fromEntries(live.a.systems.map((s) => [s.systemId, s.status])) as Record<SystemId, Status>} height={320} /></Suspense>
          <ul id="lab-fired" className="grid gap-2 text-sm">
            {fired.length === 0 && <li className="text-dust">No rule fired.</li>}
            {fired.map((f) => <li key={f.ruleId} className="border-l-2 border-mauve pl-3"><span className="font-mono text-xs text-mauve">{f.ruleId}</span><br /><span className="text-dust">{f.reason}</span><br /><span className="text-[11px] text-dust/80">Sources: {f.sourceIds.map((s) => content.sources.find((x) => x.id === s)?.publisher ?? s).join(' · ')}</span></li>)}
          </ul>
        </Card>
      </div>
    </div>
  )
}
