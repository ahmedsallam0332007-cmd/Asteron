import { useState } from 'react'
import { content } from '../../content'
import { runVector, VECTOR_GROUPS, type VectorResult } from '../../engine/vectors'
import { Card } from '../components/Status'

const total = VECTOR_GROUPS.reduce((n, g) => n + g.vectors.length, 0)

export function Verify() {
  const [res, setRes] = useState<(VectorResult & { group: string })[] | null>(null)
  const run = () => setRes(VECTOR_GROUPS.flatMap((g) => g.vectors.map((v) => ({ ...runVector(v, content), group: g.group }))))
  const passed = res?.filter((r) => r.passed).length ?? 0
  const verified = content.sources.filter((s) => s.verifiedAgainstOriginal).length
  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow">Verify · prove it is real</p>
        <h1 className="font-display text-3xl font-bold mt-1">Run the engine’s golden tests in your browser</h1>
        <p className="text-dust mt-1 max-w-[75ch]">The same {total} hand-written cases the build runs: every rule at its exact boundary, unknown never shown as normal, worst status wins. They run here on your machine, with no server. The full project has 363 automated tests.</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <Card><p className="text-xs text-dust">Rules</p><p className="font-display text-3xl font-bold">{content.rules.length}</p><p className="text-xs text-dust">each with a source</p></Card>
        <Card><p className="text-xs text-dust">Indicators</p><p className="font-display text-3xl font-bold">{content.indicators.length}</p><p className="text-xs text-dust">vitals, mind, symptoms</p></Card>
        <Card><p className="text-xs text-dust">Sources checked against the original</p><p className="font-display text-3xl font-bold">{verified} / {content.sources.length}</p><p className="text-xs text-dust">the rest are marked unverified</p></Card>
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <button id="run-vectors" className="btn btn-primary" onClick={run}>Run {total} golden tests</button>
          {res && <p id="vector-summary" className={`font-display text-xl font-bold ${passed === res.length ? 'text-st-normal' : 'text-st-urgent'}`}>{passed === res.length ? '✓' : '✖'} {passed} of {res.length} passed · {res.reduce((n, r) => n + r.ms, 0).toFixed(1)} ms</p>}
        </div>
        {res && (
          <div className="mt-4 overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-dust uppercase tracking-wider"><th className="py-2 pr-3">Group</th><th className="pr-3">Case</th><th className="pr-3">Result</th><th>ms</th></tr></thead>
              <tbody>{res.map((r) => <tr key={r.id} className="border-t border-line/60"><td className="py-1.5 pr-3 font-mono text-xs text-mauve">{r.group}</td><td className="pr-3">{r.description}</td><td className={`pr-3 font-semibold ${r.passed ? 'text-st-normal' : 'text-st-urgent'}`}>{r.passed ? '✓ pass' : `✖ ${r.failures.join('; ')}`}</td><td className="font-mono text-xs">{r.ms.toFixed(2)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
