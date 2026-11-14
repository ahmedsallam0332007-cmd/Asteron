import { stationDb } from '../data/db'
import { loadSavedMission, systemStore } from './system'
import { useApp } from './app'

/** Starts the whole system once per page load and keeps the app clock on mission time. */
let started = false
export async function bootSystem() {
  if (started) return
  started = true
  systemStore.subscribe((s) => { if (s.status === 'ready') useApp.getState().syncNow(new Date(s.missionNow).toISOString()) })
  const fresh = (await stationDb.readings.count()) === 0
  const saved = fresh ? null : loadSavedMission()
  const epoch = saved ? saved.missionAt + (Date.now() - saved.realAt) * saved.compression : Date.now()
  await systemStore.getState().start({ epoch, profile: saved?.profile ?? 'iss', scenarioId: 'healthy', reset: fresh, compression: saved?.compression })
}

/** The station node, once the system is ready. */
export function station() {
  const sys = systemStore.getState().system
  if (!sys) throw new Error('The system is still starting. Try again in a moment.')
  return sys.station
}
