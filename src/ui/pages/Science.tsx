import hz from '../../content/hazards.json'
import { content } from '../../content'
import { Card } from '../components/Status'

const COVER = {
  monitored: { label: '● Monitored', cls: 'text-st-normal border-st-normal/40' },
  partial: { label: '◐ Partly', cls: 'text-st-watch border-st-watch/40' },
  'not-monitored': { label: '○ Not monitored', cls: 'text-dust border-line' },
} as const
const label = (id: string) => content.indicators.find((i) => i.id === id)?.label ?? id

export function Science() {
  const count = (c: string) => hz.risks.filter((r) => r.coverage === c).length
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">NASA Human Research Program</p>
        <h1 className="font-display text-3xl font-bold mt-1">Five hazards, seventeen risks</h1>
        <p className="text-dust mt-2 max-w-3xl">
          NASA groups the dangers of human spaceflight into five hazards and names specific risks to health. This page shows which of those risks Asteron's daily check-in watches, which it watches only in part, and which it does not cover.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm" id="coverage-summary">
          <span className={`rounded-full border px-3 py-1 ${COVER.monitored.cls}`}>{COVER.monitored.label}: {count('monitored')}</span>
          <span className={`rounded-full border px-3 py-1 ${COVER.partial.cls}`}>{COVER.partial.label}: {count('partial')}</span>
          <span className={`rounded-full border px-3 py-1 ${COVER['not-monitored'].cls}`}>{COVER['not-monitored'].label}: {count('not-monitored')}</span>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3" id="hazards">
        {hz.hazards.map((h) => (
          <Card key={h.id} className="!p-4">
            <h2 className="font-display font-bold">{h.name}</h2>
            <p className="text-xs text-dust mt-2">“{h.nasaText}”</p>
            <p className="text-xs text-mauve mt-3">{hz.risks.filter((r) => r.hazardIds.includes(h.id)).length} linked risks</p>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="font-display text-xl font-bold">Risks and what Asteron watches</h2>
        <div className="overflow-x-auto mt-3">
          <table id="risks" className="w-full text-sm">
            <thead className="text-left text-dust text-xs uppercase tracking-wider">
              <tr><th className="py-2 pr-4">NASA risk</th><th className="pr-4">Hazard</th><th className="pr-4">Asteron indicators</th><th>Coverage</th></tr>
            </thead>
            <tbody>
              {hz.risks.map((r) => (
                <tr key={r.name} className="border-t border-line/60 align-top">
                  <td className="py-2 pr-4"><div className="font-semibold">{r.name.replace('Risk of ', '')}</div><div className="text-xs text-dust mt-0.5">“{r.nasaText}”</div></td>
                  <td className="pr-4 text-dust text-xs">{r.hazardIds.map((h) => hz.hazards.find((x) => x.id === h)!.name).join(', ')}</td>
                  <td className="pr-4 text-xs">{r.indicatorIds.length ? r.indicatorIds.map(label).join(', ') : <span className="text-dust">—</span>}</td>
                  <td><span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${COVER[r.coverage as keyof typeof COVER].cls}`}>{COVER[r.coverage as keyof typeof COVER].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-dust mt-3">{hz.notes.hazardRiskMapping} {hz.notes.systemsOps}</p>
        <p className="text-xs text-dust mt-1">
          Quoted text: <a className="text-mauve hover:underline" href="https://www.nasa.gov/hrp/hazards/" target="_blank" rel="noreferrer">NASA, 5 Hazards of Human Spaceflight</a> and{' '}
          <a className="text-mauve hover:underline" href="https://www.nasa.gov/hrp/risks/" target="_blank" rel="noreferrer">NASA, Risks of Human Spaceflight</a>, read 13 Nov 2026.
        </p>
      </Card>
    </div>
  )
}
