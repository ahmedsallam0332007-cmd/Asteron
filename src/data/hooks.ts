import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { content } from '../content'
import { assess } from '../engine'
import { stationDb } from './db'
import { useApp } from '../store/app'

export function useCrewReadings(crewId: string) {
  return useLiveQuery(() => stationDb.readings.where('crewId').equals(crewId).toArray(), [crewId])
}

export function useAssessment(crewId: string) {
  const readings = useCrewReadings(crewId)
  const now = useApp((s) => s.now)
  return useMemo(() => (readings && readings.length ? { readings, now, ...assess(content, readings, now) } : undefined), [readings, now])
}

export function useScenarioId() {
  return useLiveQuery(async () => ((await stationDb.settings.get('scenario'))?.value as { id: string } | undefined)?.id, [])
}

export function usePendingToday() {
  return useLiveQuery(async () => ((await stationDb.settings.get('pendingToday'))?.value ?? {}) as import('./seed').PendingToday, [])
}
