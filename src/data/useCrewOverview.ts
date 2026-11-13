import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { content } from '../content'
import { assess } from '../engine'
import { CREW } from '../sim'
import { stationDb } from './db'
import { useApp } from '../store/app'

/** Assessment for every crew member from the station database. */
export function useCrewOverview() {
  const all = useLiveQuery(() => stationDb.readings.toArray(), [])
  const now = useApp((s) => s.now)
  return useMemo(() => {
    if (!all || all.length === 0) return undefined // still seeding: show loading, never a false 'unknown'
    return CREW.map((c) => {
      const readings = all.filter((r) => r.crewId === c.id)
      return { crew: c, readings, ...assess(content, readings, now) }
    })
  }, [all, now])
}
