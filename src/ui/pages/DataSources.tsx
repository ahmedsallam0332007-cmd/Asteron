import { Link } from 'react-router-dom'
import { content } from '../../content'
import { CREW, generateHistory, SCENARIOS } from '../../sim'
import { Card } from '../components/Status'

/** The simulated dataset, exactly as the app uses it: every crew member x every scenario, 15 days, all 14 indicators. */
function downloadDataset() {
  const now = '2026-11-14T08:00:00.000Z'
  const lines = ['scenario,crew_id,crew_name,indicator,unit,value,taken_at,provenance,seed']
  for (const sc of SCENARIOS) for (const c of CREW) for (const r of generateHistory(c, sc, content.indicators, now)) {
    const ind = content.indicators.find((i) => i.id === r.indicatorId)!
    const p = r.provenance?.kind === 'simulated' ? r.provenance : null
    lines.push([sc.id, c.id, `"${c.name}"`, r.indicatorId, ind.unit, r.value, r.takenAt, 'SIM', p?.seed ?? ''].join(','))
  }
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: 'asteron-simulated-crew-dataset.csv' })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const REAL = [
  ['JPL Horizons ephemeris', 'Daily Earth–Mars and Earth–Moon distance and Sun angle, 2021–2040 (7,306 rows each)', 'Light time, contact plan, solar-conjunction blackouts', 'src/content/nasa/ephemeris.json'],
  ['NASA OSDR · OSD-569', 'Inspiration4 complete blood counts, 4 crew, before / after flight', 'Real astronaut data page; data-quality check', 'NASA Data page'],
  ['NASA-STD-3001 (OCHMO brief)', '600 mSv career limit [V1 4030], 250 mSv per solar event [V1 4031]', 'Radiation dose tracker', 'SHA-256 recorded'],
  ['NASA NTRS 20250006168', 'Daily dose: ISS 0.2–0.5, Moon 0.4–0.9, Mars surface 0.35–0.65 mSv', 'Simulated dosimeter stays inside these ranges', 'SHA-256 recorded'],
  ['NASA HRP hazards and risks', '5 hazards, 17 risks', 'What Asteron covers, honestly', 'Hazards page'],
]

export function DataSources() {
  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow">Data &amp; sources</p>
        <h1 className="font-display text-3xl font-bold mt-1">Real NASA data where it exists. A labelled simulation where it cannot.</h1>
        <p className="text-dust mt-1 max-w-[80ch]">Day-by-day medical data of individual astronauts is private and not published, so no team can use it. Asteron therefore runs on a simulated crew whose numbers are anchored to NASA’s published findings, and uses real NASA data for everything that is public: the geometry of the link, real astronaut blood counts and the official limits. Every simulated value is badged SIM on screen.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <p className="eyebrow">Dataset card · simulated crew</p>
          <h2 className="font-display text-2xl font-bold mt-1">6 astronauts · 14 indicators · 15 days · 7 scenarios</h2>
          <ul className="mt-3 grid gap-2 text-sm text-dust list-disc pl-5">
            <li><b className="text-star">Each astronaut has their own normal</b> (mean and day-to-day spread per indicator), and days are linked (AR(1), φ = 0.6): a bad night affects the next day.</li>
            <li><b className="text-star">Anchored to NASA findings:</b> in-flight systolic pressure about 8 mmHg lower (Norsk 2015), ISS sleep about 6.1 h (Barger 2014), daily radiation inside NASA’s published ranges.</li>
            <li><b className="text-star">Deterministic:</b> the same scenario and seed always give the same numbers, so every judge sees the same case.</li>
            <li><b className="text-star">Validated:</b> over 200 random seeds a healthy crew raises a false alert in under 0.5% of runs, and every illness scenario is detected at its expected tier every time.</li>
            <li><b className="text-star">Scenarios:</b> {SCENARIOS.map((s) => s.title).join(' · ')}.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <button id="download-dataset" className="btn btn-primary" onClick={downloadDataset}>Download the dataset (CSV)</button>
            <Link to="/lab" className="btn">Change values in the Judge Lab</Link>
          </div>
        </Card>
        <Card>
          <p className="eyebrow">Real data used</p>
          <ul className="mt-3 grid gap-3 text-sm">
            {REAL.map(([n, d, u, w]) => <li key={n} className="rounded-xl bg-void/50 p-3"><p className="font-semibold">{n}</p><p className="text-dust">{d}</p><p className="text-xs text-mauve mt-1">Used for: {u} · {w}</p></li>)}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3"><Link to="/nasa" className="btn">Real astronaut blood data</Link><Link to="/science" className="btn">NASA hazards and risks</Link></div>
        </Card>
      </div>

      <Card>
        <h2 className="font-display text-lg font-bold">Every source ({content.sources.length})</h2>
        <div className="mt-3 overflow-x-auto">
          <table id="sources" className="w-full text-sm">
            <thead><tr className="text-left text-xs text-dust uppercase tracking-wider"><th className="py-2 pr-3">Source</th><th className="pr-3">Publisher</th><th className="pr-3">Checked against original</th><th>Note</th></tr></thead>
            <tbody>{content.sources.map((s) => (
              <tr key={s.id} className="border-t border-line/60 align-top">
                <td className="py-2 pr-3">{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-mauve hover:underline">{s.title}</a> : s.title}</td>
                <td className="pr-3 text-dust">{s.publisher}{s.year ? `, ${s.year}` : ''}</td>
                <td className={`pr-3 font-semibold ${s.verifiedAgainstOriginal ? 'text-st-normal' : 'text-st-watch'}`}>{s.verifiedAgainstOriginal ? '✓ yes' : '◆ not yet'}{s.sha256 ? <span className="block font-mono text-[10px] text-dust font-normal">SHA-256 {s.sha256.slice(0, 12)}…</span> : null}</td>
                <td className="text-dust text-xs">{s.kind === 'design' ? 'Team design decision, not a medical source. ' : ''}{s.note ?? ''}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
