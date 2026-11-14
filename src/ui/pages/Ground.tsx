import { useLiveQuery } from 'dexie-react-hooks'
import { lazy, Suspense, useState } from 'react'
import { groundDb } from '../../data/db'
import { verifyAuditChain } from '../../data/groundRepo'
import { heatmap } from '../../ground/handover'
import { useSystem, systemStore } from '../../store/system'
import { SYSTEM_LABEL } from '../../lib/systems'
import type { Status, SystemId } from '../../engine/types'
import { Card, StatusBadge } from '../components/Status'
import { cardsFrom, latestOf } from '../body/cards'

const Body3D = lazy(() => import('../body/Body3D').then((m) => ({ default: m.Body3D })))
const age = (ms: number | null) => ms === null ? 'no data received' : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min old` : `${(ms / 3_600_000).toFixed(1)} h old`
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

export function Ground() {
  const status = useSystem((s) => s.status)
  const now = useSystem((s) => s.missionNow)
  const sys = useSystem((s) => s.system)
  const overview = useLiveQuery(async () => (sys ? sys.ground.crewOverview(now) : undefined), [sys, Math.floor(now / 30_000)])
  const alerts = useLiveQuery(() => groundDb.alerts.toArray(), [])
  const audit = useLiveQuery(() => groundDb.audit.orderBy('id').reverse().limit(12).toArray(), [])
  const rejected = useLiveQuery(() => groundDb.rejected.orderBy('id').reverse().limit(6).toArray(), [])
  const [sel, setSel] = useState('rahal')
  const lastCheckin = useLiveQuery(async () => (await groundDb.inbox.where('crewId').equals(sel).toArray()).filter((r) => r.kind === 'checkin').sort((a, b) => a.createdAt - b.createdAt).at(-1), [sel])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [advice, setAdvice] = useState('')
  const [chain, setChain] = useState<string | null>(null)
  const [handover, setHandover] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (status !== 'ready' || !sys || !overview) return <p className="text-dust">Starting the ground segment…</p>
  const g = sys.ground
  const run = async (f: () => Promise<unknown>) => { setErr(null); try { await f() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } }
  const cur = overview.find((c) => c.crewId === sel) ?? overview[0]
  const open = (alerts ?? []).filter((a) => a.state !== 'resolved').sort((a, b) => ({ urgent: 3, concern: 2, watch: 1 }[b.status] - { urgent: 3, concern: 2, watch: 1 }[a.status]) || a.firstSeen - b.firstSeen)
  const hm = heatmap(overview)

  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow">Ground console · flight surgeon</p>
        <h1 className="font-display text-3xl font-bold mt-1">What Earth knows, and how old it is</h1>
        <p className="text-dust mt-1 max-w-[75ch]">The ground never reads the station’s database. Everything here arrived over the link, was verified and opened. Data older than 36 h is shown as unknown, never as current. Ground clock: {iso(now)} UTC.</p>
      </div>
      {err && <p role="alert" className="rounded-xl border border-st-urgent/50 bg-st-urgent/10 px-4 py-2 text-sm text-st-urgent">{err}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" id="ground-roster">
        {overview.map((c) => (
          <button key={c.crewId} onClick={() => setSel(c.crewId)} data-crew={c.crewId} data-shown={c.shownStatus}
            className={`text-left rounded-xl border px-3 py-2 transition glass ${c.crewId === cur.crewId ? 'border-mauve' : 'hover:border-mauve/50'}`}>
            <div className="font-display font-semibold text-sm truncate">{c.name}</div>
            <div className="mt-1.5 flex items-center gap-2"><StatusBadge status={c.shownStatus as Status} />{c.openAlerts > 0 && <span className="text-[11px] text-st-concern font-semibold">{c.openAlerts} open</span>}</div>
            <div className="mt-1 text-[11px] text-dust">{age(c.dataAgeMs)}{c.directive === 'onboard-protocol' ? ' · on-board protocol' : ''}</div>
          </button>
        ))}
      </div>

      <div className="grid xl:grid-cols-[1.25fr_1fr] gap-6">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div><p className="eyebrow">Selected</p><h2 className="font-display text-2xl font-bold mt-1">{cur.name}</h2><p className="text-sm text-dust">Data {age(cur.dataAgeMs)}{cur.tier ? ` · tier ${cur.tier}` : ''}</p></div>
            <StatusBadge status={cur.shownStatus as Status} size="lg" />
          </div>
          {cur.directive === 'onboard-protocol' && <p className="mt-3 rounded-lg border border-st-watch/50 px-3 py-2 text-sm text-st-watch">The crew decided on board: the earliest answer from Earth was too late for this tier.</p>}
          <Suspense fallback={<p className="text-sm text-dust mt-3">Loading the body map…</p>}>
            <Body3D cards={cardsFrom(latestOf(((lastCheckin?.payload as { readings?: { indicatorId: string; value: number }[] } | undefined)?.readings) ?? []))} systems={Object.fromEntries((['brain', 'cardio', 'resp', 'metabolic', 'msk', 'immune'] as SystemId[]).map((k) => [k, cur.stale ? 'unknown' : ((cur.systems[k] as Status) ?? 'unknown')])) as Record<SystemId, Status>} height={360} />
          </Suspense>
          {cur.dose && <p className="text-sm"><span className="text-dust">Radiation:</span> <b>{cur.dose.careerMsv.toFixed(1)} mSv</b> career · {Math.round(cur.dose.careerFraction * 100)}% of NASA’s 600 mSv limit</p>}
        </Card>

        <Card>
          <h2 className="font-display text-lg font-bold">Alert inbox <span className="font-mono text-xs text-dust">({open.length} open)</span></h2>
          <ol id="alert-inbox" className="mt-3 grid gap-3">
            {open.length === 0 && <li className="text-dust text-sm">No open alerts.</li>}
            {open.map((a) => (
              <li key={a.id} data-alert={a.ruleId} data-state={a.state} className="rounded-xl bg-void/50 border border-line p-3 grid gap-2">
                <div className="flex flex-wrap items-center gap-2"><StatusBadge status={a.status} /><span className="font-semibold">{a.crewId}</span><span className="font-mono text-xs text-mauve">{a.ruleId}</span><span className="ml-auto text-[11px] text-dust">{a.state} · data {age(now - a.dataCreatedAt)}</span></div>
                <p className="text-sm text-dust">{a.reason}</p>
                {a.state === 'new' && <button className="btn btn-sm justify-self-start" onClick={() => run(() => g.acknowledgeAlert(a.id, 'Flight surgeon', now))}>Acknowledge</button>}
                {a.state === 'acknowledged' && (
                  <div className="flex flex-wrap gap-2">
                    <input aria-label="Resolution note" placeholder="Decision and advice to the crew (required)" value={notes[a.id] ?? ''} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} className="flex-1 min-w-48 bg-abyss/80 border border-line rounded-lg px-3 py-1.5 text-sm" />
                    <button className="btn btn-sm btn-primary" onClick={() => run(() => g.resolveAlert(a.id, 'Flight surgeon', notes[a.id] ?? '', now))}>Resolve and send advice</button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-4 border-t border-line/60 pt-4 grid gap-2">
            <label className="text-sm" htmlFor="advice">Advice to {cur.name}</label>
            <div className="flex flex-wrap gap-2">
              <input id="advice" value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="Sent up the same delayed, encrypted link" className="flex-1 min-w-48 bg-abyss/80 border border-line rounded-lg px-3 py-1.5 text-sm" />
              <button className="btn btn-sm" onClick={() => run(async () => { await g.sendAdvice(cur.crewId, advice, now); setAdvice('') })}>Send</button>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="font-display text-lg font-bold">Crew heatmap</h2>
        <div className="mt-3 overflow-x-auto">
          <table id="heatmap" className="w-full text-sm">
            <thead><tr className="text-left text-xs text-dust uppercase tracking-wider"><th className="py-2 pr-3">Crew</th>{hm.columns.map((c) => <th key={c} className="pr-3">{SYSTEM_LABEL[c]}</th>)}</tr></thead>
            <tbody>{hm.rows.map((r) => <tr key={r.crewId} className="border-t border-line/60"><td className="py-2 pr-3">{r.name}</td>{r.cells.map((c) => <td key={c.systemId} className="pr-3 py-1.5"><StatusBadge status={c.status as Status} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-bold">Audit log</h2>
            <button id="verify-audit" className="btn btn-sm" onClick={() => run(async () => { const r = await verifyAuditChain(groundDb); setChain(r.ok ? `Chain intact: ${r.entries} entries, each sealed with the SHA-256 of the one before.` : `BROKEN at entry ${r.brokenAt + 1} of ${r.entries}.`) })}>Verify chain</button></div>
          {chain && <p id="audit-result" className={`mt-2 text-sm ${chain.startsWith('Chain') ? 'text-st-normal' : 'text-st-urgent'}`}>{chain}</p>}
          <ol className="mt-3 grid gap-1 text-xs font-mono max-h-64 overflow-y-auto">
            {(audit ?? []).map((a) => <li key={a.id} className="flex gap-2"><span className="text-dust">{iso(a.at).slice(11)}</span><span className="text-mauve">{a.action}</span><span className="truncate text-dust">{a.detail}</span><span className="ml-auto text-dust/60">{a.hash.slice(0, 8)}</span></li>)}
          </ol>
          {(rejected?.length ?? 0) > 0 && <div className="mt-3"><p className="text-sm font-semibold text-st-urgent">Rejected bundles</p><ul className="text-xs font-mono text-dust">{rejected!.map((r) => <li key={r.id}>{iso(r.at).slice(11)} · {r.bundleId} · {r.reason}</li>)}</ul></div>}
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-bold">Daily handover</h2>
            <button id="handover" className="btn btn-sm btn-primary" onClick={() => run(async () => setHandover((await systemStore.getState().system!.handover()).text))}>Build handover report</button></div>
          {handover ? <pre id="handover-text" className="mt-3 whitespace-pre-wrap text-xs bg-void/60 rounded-xl p-3 max-h-80 overflow-y-auto">{handover}</pre> : <p className="mt-3 text-sm text-dust">Crew worst first, open alerts, radiation, rejected bundles and the audit check, for the next shift.</p>}
        </Card>
      </div>
    </div>
  )
}
