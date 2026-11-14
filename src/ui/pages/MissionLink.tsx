import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { groundDb, stationDb, type OutboxRecord } from '../../data/db'
import { conjunctionSpans, EPHEMERIS } from '../../link/ephemeris'
import { linkState, windowsAround } from '../../link/contactPlan'
import { formatWait } from '../../link/escalation'
import { PROFILES, type ProfileId } from '../../link/profiles'
import { useSystem, systemStore } from '../../store/system'
import { SCENARIOS } from '../../sim'
import { Card } from '../components/Status'

const H = 3_600_000
const KIND_LABEL: Record<string, string> = { alert: 'Alert', report: 'Report', checkin: 'Check-in', dose: 'Dose', journal: 'Journal', heartbeat: 'Heartbeat', raw: 'Raw data', advice: 'Advice', 'space-weather': 'Storm warning', ack: 'Ack' }
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
const AU_KM = 149_597_870.7

function Queue({ title, rows, id }: { title: string; rows?: OutboxRecord[]; id: string }) {
  const q = (rows ?? []).filter((r) => r.state === 'queued' || r.state === 'sending').sort((a, b) => b.priority - a.priority || a.seq - b.seq)
  const inflight = (rows ?? []).filter((r) => r.state === 'sent' && r.kind !== 'ack').length
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3"><h2 className="font-display text-lg font-bold">{title}</h2><span className="font-mono text-xs text-dust">{q.length} queued · {inflight} awaiting ack</span></div>
      <ol id={id} className="mt-3 grid gap-1.5 text-sm max-h-72 overflow-y-auto pr-1">
        {q.length === 0 && <li className="text-dust">Nothing waiting.</li>}
        {q.map((r) => (
          <li key={r.id} data-kind={r.kind} className="flex items-center gap-3 rounded-lg bg-void/50 px-3 py-1.5">
            <span className={`font-mono text-[10px] rounded px-1.5 py-px border ${r.priority === 3 ? 'border-st-urgent/60 text-st-urgent' : r.priority === 2 ? 'border-st-watch/60 text-st-watch' : 'border-line text-dust'}`}>P{r.priority}</span>
            <span className="font-semibold">{KIND_LABEL[r.kind]}</span>
            <span className="text-dust truncate">{r.crewId}</span>
            <span className="ml-auto font-mono text-xs text-dust tabular-nums">{r.sentBytes ? `${Math.round((r.sentBytes / r.bytes) * 100)}% of ` : ''}{(r.bytes / 1024).toFixed(1)} KB</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export function MissionLink() {
  const status = useSystem((s) => s.status)
  const profile = useSystem((s) => s.profile)
  const now = useSystem((s) => s.missionNow)
  const cut = useSystem((s) => s.cut)
  const compression = useSystem((s) => s.compression)
  const events = useSystem((s) => s.events)
  const sOut = useLiveQuery(() => stationDb.outbox.toArray(), [])
  const gOut = useLiveQuery(() => groundDb.outbox.toArray(), [])
  const [date, setDate] = useState('2023-11-18')
  const [scenario, setScenario] = useState('urgent')
  const [busy, setBusy] = useState(false)

  const st = useMemo(() => { try { return linkState(profile, now) } catch { return null } }, [profile, now])
  const timeline = useMemo(() => {
    if (!st) return null
    const from = now - 6 * H, to = now + 42 * H
    const wins: { start: number; end: number }[] = []
    let t = from
    for (let i = 0; i < 20 && t < to; i++) {
      const w = windowsAround(profile, t)
      const next = w.current ?? w.next
      if (next.start >= to) break
      wins.push(next)
      t = next.end + 1
    }
    return { from, to, wins }
  }, [profile, now, st])
  const nextConj = useMemo(() => conjunctionSpans(EPHEMERIS.mars, 2, 1).find((b) => b.end > now), [now])

  if (status !== 'ready') return <p className="text-dust">Starting the station, the ground and the link…</p>
  const act = async (f: () => Promise<unknown> | void) => { setBusy(true); try { await f() } finally { setBusy(false) } }
  const s = systemStore.getState()
  const pct = (t: number) => timeline ? `${((t - timeline.from) / (timeline.to - timeline.from)) * 100}%` : '0%'

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Mission Link</p>
          <h1 className="font-display text-3xl font-bold mt-1">The link between the crew and Earth</h1>
          <p className="text-dust mt-1 max-w-[70ch]">Real geometry from JPL Horizons. Bundles leave only inside contact windows, urgent first, and arrive one light-time later. Mission time {iso(now)} UTC · {compression === 1 ? 'real time' : `${compression}× faster (shown, never hidden)`}.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Profile">
          {(['iss', 'moon', 'mars', 'mars-direct'] as ProfileId[]).map((p) => (
            <button key={p} id={`profile-${p}`} className={`btn btn-sm ${p === profile ? 'btn-primary' : ''}`} onClick={() => s.setProfile(p)}>{PROFILES[p].label.replace(' (low Earth orbit)', '')}</button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="grid sm:grid-cols-4 gap-4">
            {[
              ['One-way light time', st ? formatWait(st.oneWaySec * 1000) : 'n/a', 'link-owlt'],
              ['Distance', st?.distanceKm ? `${(st.distanceKm / 1e6).toFixed(1)} M km · ${(st.distanceKm / AU_KM).toFixed(2)} AU` : 'Low Earth orbit', 'link-dist'],
              ['Sun–Earth–Mars angle', st?.sotDeg != null ? `${st.sotDeg.toFixed(1)}°` : '—', 'link-sot'],
              ['Link', cut ? 'CUT by operator' : st?.blackout ? 'Conjunction blackout' : st?.inContact ? 'In contact' : `Next window ${st ? formatWait(st.next.start - now) : ''}`, 'link-state'],
            ].map(([k, v, id]) => (
              <div key={k}><p className="text-xs text-dust">{k}</p><p id={id} className={`font-display text-xl font-bold mt-1 ${k === 'Link' && (cut || st?.blackout) ? 'text-st-urgent' : ''}`}>{v}</p></div>
            ))}
          </div>
          {timeline && (
            <div className="mt-6">
              <p className="text-xs text-dust mb-2">Contact windows, −6 h to +42 h · {PROFILES[profile].scheduleSource}</p>
              <div className="relative h-12 rounded-xl bg-void/60 overflow-hidden" aria-label="Contact window timeline">
                {timeline.wins.map((w) => <div key={w.start} className="absolute top-2 bottom-2 rounded-md bg-signal/20 border border-signal/60" style={{ left: pct(Math.max(w.start, timeline.from)), width: `calc(${pct(Math.min(w.end, timeline.to))} - ${pct(Math.max(w.start, timeline.from))})` }} />)}
                {st?.blackout && <div className="absolute top-2 bottom-2 rounded-md border border-dashed border-st-urgent/70 bg-[repeating-linear-gradient(45deg,rgba(239,68,68,.25)_0_6px,transparent_6px_12px)]" style={{ left: pct(Math.max(st.blackout.start, timeline.from)), right: 0 }} />}
                <div className="absolute top-0 bottom-0 w-0.5 bg-orchid shadow-[0_0_12px_#d8b4fe]" style={{ left: pct(now) }} />
              </div>
              <div className="flex justify-between font-mono text-[10px] text-dust mt-1"><span>{iso(timeline.from)}</span><span>now</span><span>{iso(timeline.to)}</span></div>
            </div>
          )}
          <p className="mt-4 text-xs text-dust">{PROFILES[profile].rateSource} {profile.startsWith('mars') && nextConj ? `Next Mars solar-conjunction blackout: ${iso(nextConj.start).slice(0, 10)} to ${iso(nextConj.end).slice(0, 10)} (${PROFILES.mars.conjunction!.source})` : ''}</p>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-bold">Controls</h2>
          <div className="mt-3 grid gap-2">
            <button id="cut" className={`btn ${cut ? 'btn-primary' : 'btn-danger'}`} disabled={busy} onClick={() => s.setCut(!cut)}>{cut ? 'Restore the link' : 'Cut the link'}</button>
            <div className="grid grid-cols-3 gap-2">
              {[['+10 min', 10 * 60_000], ['+1 h', H], ['+1 day', 24 * H]].map(([l, ms]) => <button key={l} className="btn btn-sm" disabled={busy} onClick={() => act(() => s.fastForward(ms as number))}>{l}</button>)}
            </div>
            {st && !st.inContact && <button id="to-window" className="btn btn-sm" disabled={busy} onClick={() => act(() => s.fastForward(Math.max(0, st.next.start - now) + 60_000))}>Fast-forward to the next window</button>}
            <label className="text-xs text-dust mt-1">Speed
              <select id="compression" className="mt-1 w-full bg-abyss/80 border border-line rounded-lg px-2 py-1.5 text-star" value={compression} onChange={(e) => s.setCompression(Number(e.target.value))}>
                <option value={1}>Real time (1×)</option><option value={60}>1 s = 1 min (60×)</option><option value={600}>1 s = 10 min (600×)</option>
              </select>
            </label>
            <button id="tamper" className="btn btn-sm" onClick={() => s.tamperNext('down')}>Attacker: alter the next bundle in transit</button>
            <button id="storm" className="btn btn-sm" disabled={busy} onClick={() => act(() => s.system!.ground.sendSpaceWeather({ eventId: `spe-${Date.now()}`, message: 'Solar particle event detected by space weather monitoring.' }, now))}>Ground: send a solar storm warning</button>
          </div>
          <div className="mt-4 border-t border-line/60 pt-4 grid gap-2">
            <p className="text-xs text-dust">Start a fresh mission on any date in 2021–2040 (real JPL geometry)</p>
            <div className="grid grid-cols-2 gap-2">
              <input id="mission-date" type="date" min="2021-01-02" max="2040-12-30" value={date} onChange={(e) => setDate(e.target.value)} className="bg-abyss/80 border border-line rounded-lg px-2 py-1.5 text-star" />
              <select id="mission-scenario" value={scenario} onChange={(e) => setScenario(e.target.value)} className="bg-abyss/80 border border-line rounded-lg px-2 py-1.5 text-star">
                {SCENARIOS.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
            </div>
            <button id="reset" className="btn btn-sm" disabled={busy} onClick={() => act(() => s.reset({ epoch: Date.parse(`${date}T14:30:00Z`), profile, scenarioId: scenario }))}>Start mission on {date}</button>
            <button className="btn btn-sm" disabled={busy} onClick={() => { setDate('2023-11-18'); s.setProfile('mars'); void act(() => s.reset({ epoch: Date.parse('2023-11-18T14:30:00Z'), profile: 'mars', scenarioId: 'urgent' })) }}>Demo: Mars conjunction, Nov 2023</button>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Queue title="Station outbox (downlink)" rows={sOut} id="station-queue" />
        <Queue title="Ground outbox (uplink)" rows={gOut} id="ground-queue" />
      </div>

      <Card>
        <div className="flex items-baseline justify-between"><h2 className="font-display text-lg font-bold">Arrivals</h2><span className="font-mono text-xs text-dust">verified on arrival: signature, replay, decryption, SHA-256, schema</span></div>
        <ol id="events" className="mt-3 grid gap-1 text-sm max-h-80 overflow-y-auto pr-1">
          {events.length === 0 && <li className="text-dust">Nothing has arrived yet.</li>}
          {[...events].reverse().slice(0, 60).map((e, i) => (
            <li key={`${e.id}-${i}`} data-ok={e.ok} className="flex items-center gap-3 rounded-lg bg-void/50 px-3 py-1.5">
              <span className="font-mono text-[11px] text-dust tabular-nums">{iso(e.arrivesAt).slice(11)}</span>
              <span className="font-mono text-[11px]">{e.dir === 'down' ? 'Station → Earth' : 'Earth → Station'}</span>
              <span className="font-semibold">{KIND_LABEL[e.kind ?? ''] ?? e.kind}</span>
              {e.ok ? <span className="ml-auto text-st-normal text-xs">✓ verified</span> : <span className="ml-auto text-st-urgent text-xs font-semibold">✖ rejected: {'reason' in e ? e.reason : ''}</span>}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
