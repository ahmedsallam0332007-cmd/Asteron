import { Fragment, useMemo, useState } from 'react'
import { runMission, type BundleTrace, type SimTrace, type TraceEvent } from '../../services/simulation'
import type { ProfileId } from '../../link/profiles'
import type { Status } from '../../engine/types'
import { Card, StatusBadge } from '../components/Status'

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
const dur = (ms: number) => ms < 90_000 ? `${Math.round(ms / 1000)} s` : ms < 2 * 3_600_000 ? `${Math.round(ms / 60_000)} min` : ms < 2 * 86_400_000 ? `${(ms / 3_600_000).toFixed(1)} h` : `${(ms / 86_400_000).toFixed(1)} days`
const DOT: Record<string, string> = { normal: 'bg-st-normal', watch: 'bg-st-watch', concern: 'bg-st-concern', urgent: 'bg-st-urgent', unknown: 'bg-st-unknown/50' }
const ICON: Record<string, string> = { normal: '●', watch: '◆', concern: '▲', urgent: '✖', unknown: '?' }
const ACTOR: Record<TraceEvent['actor'], string> = { station: 'Station', link: 'Link', ground: 'Ground', surgeon: 'Flight surgeon', attacker: 'Attacker', 'space-weather': 'Space weather' }

function Journey({ b, t }: { b: BundleTrace; t: SimTrace }) {
  const evs = t.events.filter((e) => e.bundleId === b.id)
  const steps: [string, string, string][] = [['Created and sealed', iso(b.createdAt), `${b.dir === 'down' ? 'On the station' : 'On Earth'}: canonical JSON, SHA-256, AES-GCM-256, ECDSA signature; stored in the outbox.`]]
  if (b.sentAt !== undefined) steps.push(['Waited for the link', dur(b.sentAt - b.createdAt), 'Queued until a contact window opened and higher-priority bundles had gone.'], ['Sent', iso(b.sentAt), `Priority P${b.priority}, ${(b.bytes / 1024).toFixed(1)} KB.${b.sends > 1 ? ` Sent ${b.sends} times (custody resend).` : ''}`])
  for (const e of evs.filter((x) => x.actor === 'attacker')) steps.push(['Altered in transit', iso(e.at), e.detail])
  for (const e of evs.filter((x) => x.action === 'rejected')) steps.push(['Refused on arrival', iso(e.at), e.detail])
  if (b.arrivedAt !== undefined) steps.push(['Arrived and verified', iso(b.arrivedAt), `Total ${dur(b.arrivedAt - b.createdAt)} from creation. Signature, replay, decryption, SHA-256 and schema all passed.`])
  else steps.push([b.outcome === 'in-queue' ? 'Still queued at mission end' : 'Still travelling at mission end', '', ''])
  return (
    <ol id="journey" className="grid gap-2">
      {steps.map(([a, w, d], i) => (
        <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-3">
          <span className={`mt-1 size-3 rounded-full ${a.startsWith('Refused') || a.startsWith('Altered') ? 'bg-st-urgent' : a.startsWith('Arrived') ? 'bg-st-normal' : 'bg-mauve'}`} aria-hidden />
          <div><p className="font-semibold">{a} <span className="font-mono text-xs text-dust font-normal">{w}</span></p>{d && <p className="text-sm text-dust">{d}</p>}</div>
        </li>
      ))}
    </ol>
  )
}

export function Simulator() {
  const [profile, setProfile] = useState<ProfileId>('mars')
  const [start, setStart] = useState('2023-11-04')
  const [days, setDays] = useState(26)
  const [seed, setSeed] = useState(1)
  const [attack, setAttack] = useState(0.25)
  const [running, setRunning] = useState<string | null>(null)
  const [prog, setProg] = useState(0)
  const [trace, setTrace] = useState<SimTrace | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [cell, setCell] = useState<{ day: number; crewId: string } | null>(null)
  const [actor, setActor] = useState<string>('all')
  const [crewF, setCrewF] = useState<string>('all')
  const [bundleId, setBundleId] = useState<string | null>(null)
  const [kindF, setKindF] = useState<string>('alert')

  const run = async () => {
    setErr(null); setTrace(null); setCell(null); setBundleId(null); setProg(0); setRunning('Preparing the crew, the keys and the link…')
    try {
      const t = await runMission({ profile, start: Date.parse(`${start}T06:00:00Z`), days, seed, attackRate: attack, stepMs: 3_600_000 }, (f, note) => { setProg(f); setRunning(note) })
      setTrace(t)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setRunning(null) }
  }

  const evs = useMemo(() => (trace?.events ?? []).filter((e) =>
    (actor === 'all' || e.actor === actor) && (crewF === 'all' || e.crewId === crewF) && (!cell || (e.at >= trace!.daily[cell.day].at && e.at < trace!.daily[cell.day].at + 86_400_000 && (!e.crewId || e.crewId === cell.crewId)))), [trace, actor, crewF, cell])
  const bundles = useMemo(() => (trace?.bundles ?? []).filter((b) => b.kind !== 'ack' && (kindF === 'all' || b.kind === kindF) && (crewF === 'all' || b.crewId === crewF)), [trace, kindF, crewF])
  const sel = trace?.bundles.find((b) => b.id === bundleId)

  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow">Mission Simulator · see everything that happened</p>
        <h1 className="font-display text-3xl font-bold mt-1">Run a whole mission, then investigate it</h1>
        <p className="text-dust mt-1 max-w-[80ch]">One button runs weeks of mission on the real system in your browser: six crew check in every day, illnesses start on planned days, the link follows NASA geometry through solar conjunction, an attacker alters messages, a solar storm hits, and the flight surgeon answers. Then explore who did what, when, and the journey of every message.</p>
      </div>

      <Card>
        <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <label className="text-sm grid gap-1"><span className="text-dust">Destination</span><select id="sim-profile" value={profile} onChange={(e) => setProfile(e.target.value as ProfileId)} className="bg-abyss/80 border border-line rounded-lg px-2 py-2"><option value="mars">Mars</option><option value="moon">Moon</option><option value="iss">Space station</option><option value="mars-direct">Mars, no relay</option></select></label>
          <label className="text-sm grid gap-1"><span className="text-dust">Start date (real JPL geometry)</span><input id="sim-start" type="date" min="2021-01-02" max="2040-10-01" value={start} onChange={(e) => setStart(e.target.value)} className="bg-abyss/80 border border-line rounded-lg px-2 py-1.5" /></label>
          <label className="text-sm grid gap-1"><span className="text-dust">Days</span><select id="sim-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-abyss/80 border border-line rounded-lg px-2 py-2">{[10, 18, 26, 40].map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
          <label className="text-sm grid gap-1"><span className="text-dust">Random seed</span><input id="sim-seed" type="number" min={1} value={seed} onChange={(e) => setSeed(Math.max(1, Number(e.target.value) || 1))} className="bg-abyss/80 border border-line rounded-lg px-2 py-1.5" /></label>
          <label className="text-sm grid gap-1"><span className="text-dust">Attacks per day</span><select value={attack} onChange={(e) => setAttack(Number(e.target.value))} className="bg-abyss/80 border border-line rounded-lg px-2 py-2"><option value={0}>None</option><option value={0.25}>1 in 4 days</option><option value={0.6}>Often</option></select></label>
          <button id="sim-run" className="btn btn-primary" disabled={!!running} onClick={run}>{running ? 'Running…' : 'Run the mission'}</button>
        </div>
        {running && <div className="mt-4"><div className="h-2 rounded-full bg-void/60 overflow-hidden"><div className="h-full bg-gradient-to-r from-asteron to-signal transition-all" style={{ width: `${Math.round(prog * 100)}%` }} /></div><p className="mt-1 text-xs text-dust">{running}</p></div>}
        {err && <p role="alert" className="mt-3 text-st-urgent text-sm">{err}</p>}
        <p className="mt-3 text-xs text-dust">Default: Mars from 4 Nov 2023, crossing NASA’s 11–25 Nov 2023 solar-conjunction command moratorium. All crew data is simulated (SIM); the geometry is real.</p>
      </Card>

      {trace && (<>
        <div id="sim-summary" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            ['Check-ins', trace.summary.checkins], ['Messages', trace.summary.bundles], ['Delivered', trace.summary.delivered],
            ['Attacks refused', `${trace.summary.rejected} / ${trace.summary.attacks}`], ['Median delivery', `${trace.summary.medianDelayMin} min`], ['Longest wait', `${trace.summary.maxDelayH} h`],
            ['Alerts on Earth', trace.summary.alerts], ['Resolved by surgeon', trace.summary.resolved], ['On-board decisions', trace.summary.onboardDecisions],
            ['Stored twice', trace.summary.storedTwice], ['Still queued', trace.summary.queuedAtEnd], ['Audit chain', trace.summary.auditOk ? `✓ ${trace.summary.auditEntries} entries` : '✖ broken'],
          ].map(([k, v]) => <div key={k} className="glass rounded-2xl px-4 py-3"><p className="text-xs text-dust">{k}</p><p className="font-display text-xl font-bold tabular-nums">{v}</p></div>)}
        </div>

        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="font-display text-lg font-bold">Mission timeline: what the station decided, and what Earth knew</h2><span className="text-xs text-dust">Click a square to see that day’s events</span></div>
          <div className="mt-3 overflow-x-auto">
            <table id="sim-timeline" className="text-xs border-separate border-spacing-[3px]">
              <thead>
                <tr><th className="text-left pr-3 font-normal text-dust">Day</th>{trace.daily.map((d) => <th key={d.day} className="font-mono font-normal text-dust w-6">{d.day + 1}</th>)}</tr>
                <tr><th className="text-left pr-3 font-normal text-dust">Link</th>{trace.daily.map((d) => <td key={d.day} title={`${iso(d.at).slice(0, 10)}: ${d.link.blackout ? 'solar-conjunction blackout' : `${d.link.contactHours} h in contact`}, ${d.link.owltMin} min one-way`} className={`h-5 rounded ${d.link.blackout ? 'bg-[repeating-linear-gradient(45deg,rgba(239,68,68,.55)_0_3px,transparent_3px_6px)]' : d.link.contactHours >= 20 ? 'bg-signal/60' : 'bg-signal/30'}`} />)}</tr>
              </thead>
              <tbody>
                {trace.crew.map((c) => (<Fragment key={c.id}>
                  <tr key={`${c.id}-s`}><th className="text-left pr-3 font-normal whitespace-nowrap">{c.name} <span className="text-dust">· station</span></th>
                    {trace.daily.map((d) => { const s = d.station[c.id]; return <td key={d.day}><button aria-label={`${c.name} day ${d.day + 1} station ${s.overall}`} onClick={() => setCell({ day: d.day, crewId: c.id })} className={`size-6 rounded grid place-items-center text-[9px] text-void ${DOT[s.overall]} ${cell?.day === d.day && cell.crewId === c.id ? 'ring-2 ring-orchid' : ''} ${s.directive === 'onboard-protocol' ? 'outline outline-2 outline-st-watch' : ''}`}>{ICON[s.overall]}</button></td> })}</tr>
                  <tr key={`${c.id}-g`}><th className="text-left pr-3 font-normal text-dust whitespace-nowrap pl-4">Earth knew</th>
                    {trace.daily.map((d) => { const g = d.ground[c.id]; return <td key={d.day}><span title={g.dataAgeH === null ? 'no data' : `data ${g.dataAgeH} h old`} className={`size-6 rounded grid place-items-center text-[9px] text-void opacity-80 ${DOT[g.shown]}`}>{ICON[g.shown]}</span></td> })}</tr>
                </Fragment>))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-dust">Hatched red: Mars solar-conjunction blackout (JPL Horizons, NASA 2° rule). Orange outline: the crew followed the on-board protocol because Earth could not answer in time. “Earth knew” turns grey (unknown) when its data is older than 36 h. Planned cases: {trace.plan.map((p) => `day ${p.day + 1} ${p.crewId} (${p.label})`).join(' · ')}.</p>
        </Card>

        <div className="grid xl:grid-cols-2 gap-6">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold mr-auto">Who did what {cell && <button className="btn btn-sm ml-2" onClick={() => setCell(null)}>Day {cell.day + 1} · {cell.crewId} ✕</button>}</h2>
              <select aria-label="Actor" value={actor} onChange={(e) => setActor(e.target.value)} className="bg-abyss/80 border border-line rounded-lg px-2 py-1 text-sm"><option value="all">All actors</option>{Object.entries(ACTOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select aria-label="Crew" value={crewF} onChange={(e) => setCrewF(e.target.value)} className="bg-abyss/80 border border-line rounded-lg px-2 py-1 text-sm"><option value="all">All crew</option>{trace.crew.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </div>
            <ol id="sim-events" className="mt-3 grid gap-1 text-sm max-h-[30rem] overflow-y-auto pr-1">
              {evs.length === 0 && <li className="text-dust">No events for this filter.</li>}
              {evs.slice(0, 400).map((e, i) => (
                <li key={i} className="grid grid-cols-[7.5rem_7rem_1fr] gap-2 rounded-lg bg-void/40 px-2 py-1.5">
                  <span className="font-mono text-[11px] text-dust">{iso(e.at).slice(5)}</span>
                  <span className={`text-xs font-semibold ${e.actor === 'attacker' || e.action === 'rejected' ? 'text-st-urgent' : e.actor === 'surgeon' ? 'text-signal' : 'text-mauve'}`}>{ACTOR[e.actor]} · {e.action}</span>
                  <span className="text-dust">{e.detail}{e.bundleId && <button className="ml-1 text-mauve hover:underline" onClick={() => setBundleId(e.bundleId!)}>trace →</button>}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold mr-auto">Follow a message</h2>
              <select aria-label="Kind" value={kindF} onChange={(e) => setKindF(e.target.value)} className="bg-abyss/80 border border-line rounded-lg px-2 py-1 text-sm">{['all', 'alert', 'report', 'checkin', 'dose', 'advice', 'space-weather', 'heartbeat'].map((k) => <option key={k} value={k}>{k}</option>)}</select>
            </div>
            <ul id="sim-bundles" className="mt-3 grid gap-1 text-sm max-h-48 overflow-y-auto pr-1">
              {bundles.slice(0, 300).map((b) => (
                <li key={b.id}><button onClick={() => setBundleId(b.id)} className={`w-full text-left grid grid-cols-[1fr_auto] gap-2 rounded-lg px-2 py-1 ${b.id === bundleId ? 'bg-asteron/30' : 'bg-void/40 hover:bg-void/70'}`}>
                  <span>{b.kind} · {b.crewId} <span className="font-mono text-[11px] text-dust">{iso(b.createdAt).slice(5)}</span>{b.attacked && <span className="ml-1 text-st-urgent text-xs">attacked</span>}</span>
                  <span className={`text-xs ${b.outcome === 'delivered' ? 'text-st-normal' : 'text-st-watch'}`}>{b.outcome}{b.arrivedAt ? ` · ${dur(b.arrivedAt - b.createdAt)}` : ''}</span>
                </button></li>
              ))}
            </ul>
            <div className="mt-4 border-t border-line/60 pt-4">{sel ? <Journey b={sel} t={trace} /> : <p className="text-sm text-dust">Pick a message (or “trace →” in the log) to see each step of its journey.</p>}</div>
          </Card>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 1)], { type: 'application/json' })); Object.assign(document.createElement('a'), { href: url, download: `asteron-mission-trace-seed${trace.options.seed}.json` }).click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>Download the full trace (JSON)</button>
          <span className="text-xs text-dust self-center">Same seed, same mission: rerun it to check any result.</span>
        </div>
        <p className="text-xs text-dust">Statuses: {(['normal', 'watch', 'concern', 'urgent', 'unknown'] as Status[]).map((s) => <span key={s} className="mr-2 inline-block"><StatusBadge status={s} /></span>)}</p>
      </>)}
    </div>
  )
}
