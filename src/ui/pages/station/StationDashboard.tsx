import { Link, useNavigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { cardsFrom, latestOf } from '../../body/cards'
import { content } from '../../../content'
import { useCrewOverview } from '../../../data/useCrewOverview'
import { useApp } from '../../../store/app'
import { station } from '../../../store/boot'
import { SYSTEM_LABEL } from '../../../lib/systems'
import { ago } from '../../../lib/format'
import { Card, ProvenanceBadge, StatusBadge } from '../../components/Status'
import { checkedInToday } from '../../../data/checkin'
import { simulateAllCheckIns } from '../../../data/simulateAll'
import { stationDb } from '../../../data/db'

const Body3D = lazy(() => import('../../body/Body3D').then((m) => ({ default: m.Body3D })))

const lastAt = (rs: { takenAt: string }[]) => rs.reduce<string | undefined>((m, r) => (!m || r.takenAt > m ? r.takenAt : m), undefined)

function PendingChip() {
  return <span data-pending className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-mauve/60 px-2.5 py-0.5 text-xs font-semibold text-mauve whitespace-nowrap"><span aria-hidden>◷</span>Check-in pending</span>
}

export function StationDashboard() {
  const overview = useCrewOverview()
  const { crewId, setCrew, now } = useApp()
  const navigate = useNavigate()
  const inbox = useLiveQuery(() => stationDb.inbox.orderBy('receivedAt').reverse().limit(4).toArray(), [])
  const decision = useLiveQuery(async () => (await stationDb.escalations.where('crewId').equals(crewId).sortBy('at')).at(-1), [crewId])
  if (!overview) return <p className="text-dust">Loading station data…</p>
  const cur = overview.find((o) => o.crew.id === crewId) ?? overview[0]
  const tier = content.tiers.find((t) => t.tier === cur.tier.tier)!
  const { bio } = cur.crew
  const curLast = lastAt(cur.readings)
  const curDone = checkedInToday(curLast, now)
  const pendingCount = overview.filter((o) => !checkedInToday(lastAt(o.readings), now)).length

  return (
    <div className="flex flex-col gap-6">
      {pendingCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mauve/40 bg-asteron/10 px-4 py-3 text-sm">
          <span><b>{pendingCount} of 6</b> crew members have not checked in today. Nothing is assessed for today until they do.</span>
          <button
            id="simulate-all"
            className="btn btn-sm"
            onClick={async () => { await simulateAllCheckIns(stationDb, station(), Date.parse(useApp.getState().now)) }}
          >Run simulated check-ins for the rest</button>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" role="tablist" aria-label="Crew">
        {overview.map((o) => (
          <button
            key={o.crew.id}
            role="tab"
            aria-selected={o.crew.id === cur.crew.id}
            onClick={() => setCrew(o.crew.id)}
            className={`text-left rounded-xl border px-3 py-2 transition ${o.crew.id === cur.crew.id ? 'border-mauve bg-asteron/15' : 'border-line bg-hull/60 hover:border-mauve/50'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-semibold text-sm truncate">{o.crew.name.split(' ').slice(1).join(' ')}</span>
              <span className="font-mono text-[10px] text-dust">{o.crew.bio.callsign}</span>
            </div>
            <div className="mt-1.5">{checkedInToday(lastAt(o.readings), now) ? <StatusBadge status={o.overall.status} /> : <PendingChip />}</div>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-mauve">{cur.crew.role}</p>
              <h1 className="font-display text-3xl font-bold mt-1">{cur.crew.name}</h1>
              <p className="text-dust text-sm mt-1">
                “{bio.callsign}” · {bio.age} y · {bio.nationality} · flight day {bio.flightDay} of {bio.missionDays}
              </p>
            </div>
            {curDone ? <StatusBadge status={cur.overall.status} size="lg" /> : <PendingChip />}
          </div>
          <p className="mt-3 text-xs font-mono uppercase tracking-wider text-dust">
            {curDone ? `Today's check-in · ${ago(curLast!, now)}` : `Today's check-in not done · showing the last result (${curLast ? ago(curLast, now) : 'none'})`}
          </p>
          <div id="body-3d" className="mt-3 rounded-2xl border border-line/70 bg-[radial-gradient(60%_60%_at_50%_45%,rgba(124,58,237,.22),transparent_70%)] p-3">
            <Suspense fallback={<p className="p-4 text-sm text-dust">Loading the body map…</p>}>
              <Body3D systems={Object.fromEntries(cur.systems.map((s) => [s.systemId, curDone ? s.status : 'unknown'])) as never} cards={cardsFrom(latestOf(cur.readings))} onPick={(id) => navigate(`/station/system/${id}`)} height={420} />
            </Suspense>
            <p className="px-1 pt-2 text-[11px] text-dust">Drag to rotate. A part glows in its status colour; every card says the status in words. Click a part or a card for the rule, the readings and the source.{!curDone && ' Grey until today\'s check-in.'}</p>
          </div>
          <div className={`mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 ${curDone ? '' : 'opacity-60'}`}>
            {cur.systems.map((s) => (
              <Link
                key={s.systemId}
                to={`/station/system/${s.systemId}`}
                className="rounded-xl border border-line bg-abyss/70 p-3 hover:border-mauve/60 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{SYSTEM_LABEL[s.systemId]}</span>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-xs text-dust mt-2 line-clamp-2 min-h-8">
                  {s.drivers[0]?.fired[0]?.reason.split('. ')[0] ??
                    (s.status === 'unknown' ? 'No recent reading.' : 'All readings in range.')}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        <Card className={tier.tier >= 3 ? 'border-st-concern/50' : ''}>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-mauve">Escalation</p>
          {curDone ? (
            <>
              <h2 className="font-display text-2xl font-bold mt-1">Tier {tier.tier} · {tier.label}</h2>
              <ol className="mt-3 flex flex-col gap-2 text-sm text-dust list-decimal pl-5">
                {tier.actions.map((a) => <li key={a}>{a}</li>)}
              </ol>
            </>
          ) : (
            <>
              <h2 className="font-display text-2xl font-bold mt-1">Awaiting today's check-in</h2>
              <p className="mt-3 text-sm text-dust">The escalation tier for today is decided after {cur.crew.name.split(' ').slice(1).join(' ')} submits today's readings.</p>
            </>
          )}
          {curDone && decision && (
            <p id="station-directive" data-directive={decision.directive} className={`mt-3 rounded-lg border px-3 py-2 text-sm ${decision.directive === 'onboard-protocol' ? 'border-st-watch/50 text-st-watch' : 'border-line text-dust'}`}>
              <b>{decision.directive === 'onboard-protocol' ? '⚠ On-board protocol now. ' : '✓ Earth can answer in time. '}</b>{decision.explanation}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/station/checkin" className="btn btn-primary">
              Start daily check-in
            </Link>
            <Link to="/station/report" className="btn">
              Report for flight surgeon
            </Link>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-baseline justify-between gap-3"><h2 className="font-display text-lg font-bold">Messages from Earth</h2><span className="font-mono text-xs text-dust">verified · decrypted · acknowledged</span></div>
        <ul id="station-inbox" className="mt-3 grid gap-2 text-sm">
          {(inbox ?? []).length === 0 && <li className="text-dust">Nothing received yet. Replies from the flight surgeon arrive here after the link delay.</li>}
          {(inbox ?? []).map((m) => {
            const p = m.payload as { text?: string; message?: string; shelterText?: string; crewId?: string }
            return (
              <li key={m.id} data-kind={m.kind} className={`rounded-xl border p-3 ${m.kind === 'space-weather' ? 'border-st-urgent/60 bg-st-urgent/10' : 'border-line bg-void/40'}`}>
                <p className="font-semibold">{m.kind === 'space-weather' ? '☢ Solar storm warning: shelter now' : `Flight surgeon → ${p.crewId}`}</p>
                <p className="text-dust">{m.kind === 'space-weather' ? `${p.message} ${p.shelterText}` : p.text}</p>
                <p className="mt-1 font-mono text-[11px] text-dust">Sent {new Date(m.createdAt).toISOString().slice(11, 16)} UTC · arrived {new Date(m.receivedAt).toISOString().slice(11, 16)} UTC</p>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-bold mb-3">Latest readings</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-dust text-xs uppercase tracking-wider">
              <tr><th className="py-2 pr-4">Indicator</th><th className="pr-4">Value</th><th className="pr-4">Source</th><th className="pr-4">Taken</th><th>Status</th></tr>
            </thead>
            <tbody>
              {cur.evaluations.map((e) => {
                const ind = content.indicators.find((i) => i.id === e.indicatorId)!
                const series = cur.readings.filter((r) => r.indicatorId === e.indicatorId).sort((a, b) => a.takenAt.localeCompare(b.takenAt))
                const last = series[series.length - 1]
                return (
                  <tr key={e.indicatorId} className="border-t border-line/60">
                    <td className="py-2 pr-4">{ind.label}</td>
                    <td className="pr-4 font-mono tabular-nums">{last ? `${last.value} ${ind.unit}` : '—'}</td>
                    <td className="pr-4"><ProvenanceBadge p={last?.provenance} /></td>
                    <td className="pr-4 text-dust">{last ? ago(last.takenAt, now) : '—'}</td>
                    <td><StatusBadge status={e.status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
