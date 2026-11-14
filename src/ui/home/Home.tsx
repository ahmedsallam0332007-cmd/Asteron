import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { useSystem } from '../../store/system'
import { linkState } from '../../link/contactPlan'
import { PROFILES } from '../../link/profiles'
import { formatWait } from '../../link/escalation'
import { NebulaSky } from './NebulaSky'

const EarthScene = lazy(() => import('./EarthScene').then((m) => ({ default: m.EarthScene })))

const STEPS = [
  { n: '01', k: 'Measure', t: 'Daily check-in', d: 'Vitals, sleep, mood, stress, workload and symptoms. Every value carries its source: SIM, MANUAL or JUDGE.' },
  { n: '02', k: 'Decide on board', t: 'Own normal, real delay', d: 'Each astronaut is compared with their own baseline and published thresholds. If Earth cannot answer in time, the crew gets the on-board protocol now.' },
  { n: '03', k: 'Seal & queue', t: 'Store and forward', d: 'Every report is encrypted (AES-256) and signed, then queued. Urgent goes first; nothing is lost while the link is down.' },
  { n: '04', k: 'Deliver', t: 'When the sky allows', d: 'Sent only in real contact windows, one light-time to Earth. The flight surgeon answers; the answer travels back the same way.' },
]
const SOURCES = [
  ['JPL Horizons', 'Real Earth–Mars and Earth–Moon distances, 2021–2040', 'Light time, conjunction blackouts'],
  ['NASA OSDR · OSD-569', 'Inspiration4 crew blood counts', 'Real astronaut data, unchanged'],
  ['NASA-STD-3001', '600 mSv career, 250 mSv per solar event', 'Radiation limits'],
  ['NASA NTRS 2025', 'ISS, Moon and Mars daily dose ranges', 'Simulated dosimeter range'],
  ['NASA HRP', '5 hazards, 17 risks of human spaceflight', 'What we monitor, and what we do not'],
  ['Norsk 2015 · Barger 2014', 'In-flight blood pressure and ISS sleep', 'Simulation anchors'],
]

function LiveStatus() {
  const status = useSystem((s) => s.status)
  const profile = useSystem((s) => s.profile)
  const now = useSystem((s) => s.missionNow)
  const cut = useSystem((s) => s.cut)
  if (status !== 'ready') return <p className="text-sm text-dust">Starting the station, the ground and the link…</p>
  let st: ReturnType<typeof linkState> | null = null
  try { st = linkState(profile, now) } catch { st = null }
  const row = (k: string, v: string, id?: string) => <div className="flex justify-between gap-4 py-2 border-t border-line/60 first:border-0"><span className="text-dust">{k}</span><b id={id} className="font-mono font-medium text-right">{v}</b></div>
  return (
    <div className="text-sm">
      {row('Profile', PROFILES[profile].label)}
      {row('Mission time (UTC)', new Date(now).toISOString().slice(0, 16).replace('T', ' '))}
      {st && row('One-way light time', formatWait(st.oneWaySec * 1000), 'home-owlt')}
      {st && row('Link', cut ? 'Cut by operator' : st.blackout ? 'Solar conjunction blackout' : st.inContact ? 'In contact' : `Next window in ${formatWait(st.next.start - now)}`)}
    </div>
  )
}

export function Home() {
  return (
    <div>
      <section className="relative min-h-[100svh] overflow-hidden -mt-[4.25rem] pt-[4.25rem]">
        <div aria-hidden className="absolute inset-0"><NebulaSky /></div>
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,5,12,.8)_0%,rgba(8,5,12,.4)_45%,rgba(8,5,12,0)_100%)]" />
        <div aria-hidden className="absolute inset-0" id="earth-scene">
          <Suspense fallback={null}><EarthScene /></Suspense>
        </div>
        <div className="relative mx-auto max-w-7xl px-4 min-h-[calc(100svh-4.25rem)] grid content-center gap-6 py-16 pointer-events-none">
          <p className="eyebrow rise">Astronaut health monitoring · offline first · delay aware</p>
          <h1 className="rise font-display font-bold text-[clamp(2.6rem,6.6vw,5.6rem)] leading-[1.02] tracking-[-0.02em] max-w-[13ch] [text-wrap:balance]">
            Astronaut health, <span className="grad-text">even when Earth can’t answer.</span>
          </h1>
          <p className="rise text-dust text-[clamp(1rem,1.6vw,1.2rem)] max-w-[56ch]">
            Asteron tracks physical and psychological stress for every crew member, decides on board when the flight surgeon cannot reply in time, and carries each report home over a sealed, delay-tolerant link.
          </p>
          <div className="rise flex flex-wrap gap-3 pointer-events-auto">
            <Link to="/station" className="btn btn-primary" id="cta-station">Open the Station</Link>
            <Link to="/link" className="btn">See the Mission Link</Link>
            <a href="#judges" className="btn">Judges: start here</a>
          </div>
          <div className="rise grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-3xl mt-2">
            {[['22.2 min', 'longest one-way delay to Mars', 'JPL HORIZONS'], ['~2 weeks', 'link blackout at solar conjunction', 'NASA 2° RULE'], ['600 mSv', 'career radiation limit', 'NASA-STD-3001']].map(([v, l, s]) => (
              <div key={v} className="glass rounded-2xl px-4 py-3">
                <b className="block font-display text-2xl tabular-nums">{v}</b>
                <span className="text-xs text-dust">{l}</span>
                <small className="block font-mono text-[10px] text-mauve mt-1 tracking-wider">{s}</small>
              </div>
            ))}
          </div>
        </div>
        <a href="#problem" className="absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-[0.2em] text-dust hover:text-star">SCROLL ↓</a>
      </section>

      <div className="relative">
        <div className="space-bg" aria-hidden />
        <div className="mx-auto max-w-7xl px-4 py-20 grid gap-24">
          <section id="judges" className="glass rounded-3xl p-8 md:p-10 border-signal/40">
            <p className="eyebrow">Judges: start here · 5 minutes, no login, works offline</p>
            <h2 className="mt-2 font-display text-[clamp(1.6rem,3vw,2.4rem)] font-bold">Try the whole system yourself</h2>
            <ol className="mt-5 grid md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {[
                ['Station', 'Start daily check-in → Save and analyse. See the steps, the tier, and the link decision (“Earth can answer in time” or “On-board protocol now”). The 3D body shows where.', '/station/checkin'],
                ['Ground', 'The same astronaut appears with the age of the data. Acknowledge an alert, write a note, Resolve and send advice. Verify the audit chain.', '/ground'],
                ['Mission Link', 'Press “Attacker: alter the next bundle”, then do a check-in: the arrival list shows it refused. Press “Demo: Mars conjunction, Nov 2023”: the link goes dark for two weeks.', '/link'],
                ['Simulator', 'Run the mission (26 days, about 20 s). Click any square of the timeline, filter who did what, and follow one message from creation to arrival.', '/simulator'],
                ['Judge Lab', 'Type your own values or pick a preset (infection, overload, CO2, SANS). The engine and the body update live, with the rule and its source.', '/lab'],
                ['Verify and Data', 'Run the 76 golden tests in your browser. See every source, which ones we checked against the original, and download the simulated dataset.', '/verify'],
              ].map(([t, d, to], i) => (
                <li key={t} className="grid grid-cols-[2rem_1fr] gap-2"><span className="font-mono text-signal">{String(i + 1).padStart(2, '0')}</span><span><Link to={to} className="font-semibold text-orchid hover:underline">{t} →</Link> <span className="text-dust">{d}</span></span></li>
              ))}
            </ol>
            <p className="mt-5 text-xs text-dust">What works: everything on this site runs for real in your browser (engine, encrypted link, ground console, simulator); 381 automated tests. Limits: crew data is simulated (SIM), medical rules are not yet clinically reviewed, and the link security follows BPSec ideas but is not certified. Project document, 30-second demo, system cycle with test results, and the mission dataset: <a className="text-mauve hover:underline" href="/media/asteron-project.pdf">PDF</a> · <a className="text-mauve hover:underline" href="/media/asteron-demo-30s.mp4">video</a> · <a className="text-mauve hover:underline" href="/media/asteron-system-cycle.pdf">cycle and tests</a> · <Link className="text-mauve hover:underline" to="/data">dataset</Link>.</p>
          </section>

          <section id="problem" className="glass rounded-3xl p-8 md:p-12">
            <p className="eyebrow">The problem</p>
            <blockquote className="mt-4 font-display text-[clamp(1.4rem,2.6vw,2.1rem)] leading-snug max-w-[34ch]">
              “Future crews on deep space missions must be able to live and work in an environment where they may face unexpected problems… without real-time support from mission control.”
            </blockquote>
            <p className="mt-4 font-mono text-xs text-mauve tracking-wider">NASA HUMAN RESEARCH PROGRAM · RISK 15 OF 17 · EARTH-INDEPENDENT OPERATIONS</p>
          </section>

          <section className="grid gap-8">
            <div><p className="eyebrow">How it works</p><h2 className="mt-2 font-display text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold max-w-[24ch] leading-tight">From a check-in on the station to a decision on Earth.</h2></div>
            <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {STEPS.map((s) => (
                <li key={s.n} className="glass rounded-2xl p-5 grid gap-2 content-start">
                  <span className="font-mono text-xs text-signal tracking-[0.14em]">{s.n} · {s.k.toUpperCase()}</span>
                  <h3 className="font-display text-xl font-bold">{s.t}</h3>
                  <p className="text-sm text-dust">{s.d}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="grid lg:grid-cols-[1.2fr_1fr] gap-6 items-start">
            <div className="glass rounded-3xl p-8">
              <p className="eyebrow">Running now in your browser</p>
              <h2 className="mt-2 font-display text-3xl font-bold">A real station, a real ground, one link.</h2>
              <p className="mt-3 text-dust">Two separate databases that never read each other. Every message crosses an encrypted link that follows real NASA geometry. Open the pages and watch the same data arrive on Earth minutes later.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/station" className="btn btn-primary">Station</Link>
                <Link to="/link" className="btn">Mission Link</Link>
                <Link to="/ground" className="btn">Ground</Link>
                <Link to="/lab" className="btn">Judge Lab</Link>
              </div>
            </div>
            <div className="glass rounded-3xl p-6"><p className="eyebrow mb-3">Live link</p><LiveStatus /></div>
          </section>

          <section className="grid gap-6">
            <div><p className="eyebrow">Built on NASA’s own data</p><h2 className="mt-2 font-display text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold max-w-[26ch] leading-tight">We do not invent numbers. Every threshold has a source.</h2></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SOURCES.map(([n, d, u]) => (
                <div key={n} className="glass rounded-2xl p-5">
                  <p className="font-mono text-xs text-signal tracking-wider">{n}</p>
                  <p className="mt-2 font-semibold">{d}</p>
                  <p className="mt-1 text-sm text-dust">{u}</p>
                </div>
              ))}
            </div>
            <Link to="/data" className="btn justify-self-start">All data and sources</Link>
          </section>
        </div>
      </div>
    </div>
  )
}
