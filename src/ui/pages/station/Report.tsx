import { useState } from 'react'
import { Link } from 'react-router-dom'
import { content } from '../../../content'
import { useAssessment } from '../../../data/hooks'
import { buildReport } from '../../../lib/report'
import { useApp } from '../../../store/app'
import { CREW } from '../../../sim'
import { Card } from '../../components/Status'

export function Report() {
  const crewId = useApp((s) => s.crewId)
  const a = useAssessment(crewId)
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  if (!a) return <p className="text-dust">Loading…</p>
  const crew = CREW.find((c) => c.id === crewId)!
  const text = buildReport({ crew, content, ...a })
  return (
    <div className="flex flex-col gap-4">
      <Link to="/station" className="text-sm text-mauve hover:underline">← Dashboard</Link>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold">Report for the flight surgeon</h1>
          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={async () => {
                try { await navigator.clipboard.writeText(text); setCopied('ok') } catch { setCopied('fail') }
              }}
            >Copy report</button>
            <button className="rounded-xl border border-mauve px-4 py-2 font-semibold text-mauve" onClick={() => window.print()}>Print</button>
          </div>
        </div>
        {copied === 'ok' && <p role="status" className="text-sm text-st-normal mt-2">Copied.</p>}
        {copied === 'fail' && <p role="status" className="text-sm text-st-watch mt-2">Copy is blocked here. Select the text below and copy it.</p>}
        <pre id="report-text" className="mt-4 whitespace-pre-wrap font-mono text-sm bg-abyss border border-line rounded-xl p-4 overflow-x-auto">{text}</pre>
      </Card>
    </div>
  )
}
