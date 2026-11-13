import { content, sourceById } from '../../content'
import type { Evaluation } from '../../engine/types'
import { ProvenanceBadge, StatusBadge } from './Status'
import { AnchorNote } from './Anchor'

/** Shows exactly why an indicator has its status: rule, readings, sources, review state. */
export function WhyPanel({ evaluation }: { evaluation: Evaluation }) {
  const ind = content.indicators.find((i) => i.id === evaluation.indicatorId)!
  return (
    <div className="rounded-xl border border-line bg-abyss/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{ind.label}</h3>
        <StatusBadge status={evaluation.status} />
      </div>
      <div className="mt-2"><AnchorNote indicatorId={ind.id} /></div>
      {evaluation.status === 'unknown' && <p className="text-sm text-dust mt-2">No reading in the last {ind.staleHours} hours. Unknown is never shown as normal: re-measure.</p>}
      {evaluation.notes.filter((n) => n !== 'no recent reading').map((n) => (
        <p key={n} className="text-xs text-dust mt-2 font-mono">Note: {n}</p>
      ))}
      {evaluation.fired.length === 0 && evaluation.status !== 'unknown' && <p className="text-sm text-dust mt-2">No rule fired.</p>}
      <ul className="mt-3 flex flex-col gap-3">
        {evaluation.fired.map((f) => {
          const rule = content.rules.find((r) => r.id === f.ruleId)!
          return (
            <li key={f.ruleId} className="border-l-2 border-mauve pl-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-mauve">{rule.id}</span>
                <span className="rounded border border-line px-1.5 text-dust">{rule.type}</span>
                <StatusBadge status={rule.resultStatus} />
              </div>
              <p className="text-sm mt-1.5">{f.reason}</p>
              <p className="text-xs text-dust mt-1.5 flex flex-wrap items-center gap-1.5">
                Readings used:
                {f.readings.map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-1 font-mono">
                    {r.value} <ProvenanceBadge p={r.provenance} />
                  </span>
                ))}
              </p>
              <ul className="text-xs mt-1.5 flex flex-col gap-0.5">
                {f.sourceIds.map((sid) => {
                  const s = sourceById(sid)
                  return (
                    <li key={sid} className="text-dust">
                      Source:{' '}
                      {s?.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-mauve hover:underline">{s.title}</a> : <span className="text-star">{s?.title ?? sid}</span>}
                      {s && ` · ${s.publisher}${s.year ? ` ${s.year}` : ''}`}
                      {s?.kind === 'design' && ' (team decision, not a medical source)'}
                    </li>
                  )
                })}
              </ul>
              <p className="text-[11px] text-st-watch/90 mt-1.5">
                {rule.reviewStatus === 'unchecked'
                  ? 'Threshold not yet checked against the original source. Status mapping by Team Asteron, not reviewed by a clinician.'
                  : 'Threshold checked against the original source. Status mapping by Team Asteron, not reviewed by a clinician.'}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
