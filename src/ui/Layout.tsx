import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Logo } from './components/Logo'
import { NebulaSky } from './home/NebulaSky'
import { SCENARIOS } from '../sim'
import { useScenarioId } from '../data/hooks'
import { bootSystem } from '../store/boot'
import { useSystem, systemStore } from '../store/system'
import { oneWaySeconds } from '../link/contactPlan'
import { PROFILES } from '../link/profiles'
import { formatWait } from '../link/escalation'

const NAV = [
  ['/station', 'Station'],
  ['/link', 'Mission Link'],
  ['/ground', 'Ground'],
  ['/lab', 'Judge Lab'],
  ['/simulator', 'Simulator'],
  ['/data', 'Data & Sources'],
  ['/verify', 'Verify'],
  ['/about', 'About'],
] as const

function LinkChip() {
  const status = useSystem((s) => s.status)
  const profile = useSystem((s) => s.profile)
  const cut = useSystem((s) => s.cut)
  const now = useSystem((s) => s.missionNow)
  if (status !== 'ready') return <span className="font-mono text-xs text-dust">{status === 'error' ? 'System error' : 'Starting system…'}</span>
  let delay = ''
  try { delay = formatWait(oneWaySeconds(profile, now).sec * 1000) } catch { delay = 'n/a' }
  return (
    <NavLink to="/link" id="link-chip" className="hidden lg:inline-flex items-center gap-2 font-mono text-xs text-signal whitespace-nowrap">
      <i className={`inline-block size-2 rounded-full ${cut ? 'bg-st-urgent' : 'bg-signal pulse-dot'}`} aria-hidden />
      {PROFILES[profile].label.split(' (')[0].toUpperCase()} · {cut ? 'LINK CUT' : `${delay} one-way`}
    </NavLink>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  const home = pathname === '/'
  const scenarioId = useScenarioId()
  const error = useSystem((s) => s.error)
  useEffect(() => { void bootSystem() }, [])

  return (
    <div className="min-h-full flex flex-col">
      <div className="space-bg" aria-hidden><NebulaSky key={home ? 'home' : 'page'} animate={home} />{!home && <div className="absolute inset-0 bg-void/70" />}</div>
      <header className="sticky top-3 z-30 px-3">
        <div className="glass mx-auto max-w-7xl rounded-2xl px-4 h-14 flex items-center gap-4">
          <NavLink to="/" className="flex items-center gap-2.5 font-brand font-bold text-[17px] tracking-[0.2em] text-star shrink-0" aria-label="Asteron home">
            <Logo size={26} /> ASTERON
          </NavLink>
          <nav className="flex gap-0.5 text-[13px] overflow-x-auto min-w-0 [scrollbar-width:none]" aria-label="Main">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to}
                className={({ isActive }) => `px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors ${isActive ? 'bg-asteron/30 text-orchid' : 'text-dust hover:text-star hover:bg-white/5'}`}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <LinkChip />
            <label className="hidden xl:flex items-center gap-2 text-xs text-dust">
              <span className="font-mono uppercase tracking-wider hidden 2xl:inline">Scenario</span>
              <select id="scenario" aria-label="Scenario" title="Scenario" className="bg-abyss/80 border border-line rounded-lg px-2 py-1 text-star max-w-[11rem]" value={scenarioId ?? ''}
                onChange={async (e) => { const s = systemStore.getState(); await s.reset({ epoch: s.missionNow, profile: s.profile, scenarioId: e.target.value }) }}>
                {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </label>
          </div>
        </div>
      </header>
      {error && <div role="alert" className="mx-auto mt-3 max-w-7xl rounded-xl border border-st-urgent/50 bg-st-urgent/10 px-4 py-2 text-sm text-st-urgent">System error: {error}</div>}
      <main className={home ? 'flex-1' : 'flex-1 mx-auto w-full max-w-7xl px-4 py-8'}>
        <Outlet />
      </main>
      <footer className="border-t border-line/70 text-xs text-dust bg-void/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-5 flex flex-wrap gap-x-6 gap-y-1 justify-between">
          <span>Self-support aid, not a medical diagnosis. Station and Ground crew data is simulated; the NASA Data page shows real published data.</span>
          <span>Team Asteron · NASA Space Apps 2026 Cairo · imagery: NASA, ESA, CSA, STScI · not endorsed by NASA</span>
        </div>
      </footer>
    </div>
  )
}
