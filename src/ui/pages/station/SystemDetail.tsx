import { Link, useParams } from 'react-router-dom'
import { content } from '../../../content'
import { useAssessment } from '../../../data/hooks'
import type { SystemId } from '../../../engine/types'
import { SYSTEM_LABEL } from '../../../lib/systems'
import { useApp } from '../../../store/app'
import { CREW } from '../../../sim'
import { Card, StatusBadge } from '../../components/Status'
import { WhyPanel } from '../../components/WhyPanel'

export function SystemDetail() {
  const { id } = useParams<{ id: SystemId }>()
  const crewId = useApp((s) => s.crewId)
  const a = useAssessment(crewId)
  const crew = CREW.find((c) => c.id === crewId)!
  if (!a || !id || !(id in SYSTEM_LABEL)) return <p className="text-dust">Loading…</p>
  const sys = a.systems.find((s) => s.systemId === id)!
  const members = content.indicators.filter((i) => i.systems.includes(id))
  const guide = content.guidance.find((g) => g.systemId === id && g.status === sys.status)
  return (
    <div className="flex flex-col gap-6">
      <Link to="/station" className="text-sm text-mauve hover:underline">← Dashboard</Link>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-mauve">{crew.name}</p>
            <h1 className="font-display text-3xl font-bold mt-1">{SYSTEM_LABEL[id]}</h1>
          </div>
          <StatusBadge status={sys.status} size="lg" />
        </div>
        {guide && (
          <div className="mt-4 rounded-xl border border-mauve/40 bg-asteron/10 p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-mauve">What to do</p>
            <p className="mt-1">{guide.text}</p>
          </div>
        )}
      </Card>
      <section>
        <h2 className="font-display text-xl font-bold mb-3">Why this status?</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {members.map((ind) => <WhyPanel key={ind.id} evaluation={a.evaluations.find((e) => e.indicatorId === ind.id)!} />)}
        </div>
      </section>
    </div>
  )
}
