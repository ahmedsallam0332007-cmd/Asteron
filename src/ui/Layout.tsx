import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from './components/Logo'
import { useApp } from '../store/app'
import { stationDb } from '../data/db'
import { SCENARIOS } from '../sim'
import { useScenarioId } from '../data/hooks'
import { ensureSeeded, seedScenario } from '../data/seed'

const NAV = [
  ['/station', 'Station'],
  ['/ground', 'Ground'],
  ['/nasa', 'NASA Data'],
  ['/lab', 'Judge Lab'],
  ['/verify', 'Verify'],
  ['/about', 'About'],
] as const

export function Layout() {
  const tick = useApp((s) => s.tick)
  const scenarioId = useScenarioId()
  useEffect(() => {
    const now = new Date().toISOString()
    ensureSeeded(stationDb, now).then(() => useApp.getState().setNow(now))
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [tick])

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-void/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-6">
          <NavLink to="/" className="flex items-center gap-2 font-display font-bold tracking-[0.2em] text-orchid">
            <Logo size={24} /> ASTERON
          </NavLink>
          <nav className="flex gap-1 text-sm overflow-x-auto">
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg whitespace-nowrap ${isActive ? 'bg-asteron/20 text-orchid' : 'text-dust hover:text-star'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <label className="ml-auto hidden md:flex items-center gap-2 text-xs text-dust">
            <span className="font-mono uppercase tracking-wider">Scenario</span>
            <select
              id="scenario"
              className="bg-abyss border border-line rounded-lg px-2 py-1 text-star"
              value={scenarioId ?? ''}
              onChange={async (e) => {
                const now = new Date().toISOString()
                await seedScenario(stationDb, e.target.value, now)
                useApp.getState().setNow(now)
              }}
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-line text-xs text-dust">
        <div className="mx-auto max-w-7xl px-4 py-4 flex flex-wrap gap-x-6 gap-y-1 justify-between">
          <span>Self-support aid, not a medical diagnosis. Station and Ground crew data is simulated; the NASA Data page shows real published data.</span>
          <span>Team Asteron · NASA Space Apps 2026 Cairo · not endorsed by NASA</span>
        </div>
      </footer>
    </div>
  )
}
