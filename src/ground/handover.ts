import type { GroundAlert } from './alerts'
import type { CrewOverview } from './node'

const RANK: Record<string, number> = { urgent: 4, concern: 3, watch: 2, unknown: 1, normal: 0 }
const SYSTEMS = ['brain', 'cardio', 'resp', 'metabolic', 'msk', 'immune'] as const
const hours = (ms: number) => `${(ms / 3_600_000).toFixed(1)} h`

export interface Handover {
  at: number
  crew: CrewOverview[]
  openAlerts: GroundAlert[]
  text: string
}

/** Daily handover report (K4) for the next flight-surgeon shift. Pure: built only from what the ground received. */
export function buildHandover(a: { now: number; crew: CrewOverview[]; alerts: GroundAlert[]; rejected: number; auditOk: boolean; profile: string }): Handover {
  const crew = [...a.crew].sort((x, y) => RANK[y.shownStatus] - RANK[x.shownStatus] || (y.tier ?? 0) - (x.tier ?? 0))
  const openAlerts = a.alerts.filter((x) => x.state !== 'resolved').sort((x, y) => RANK[y.status] - RANK[x.status] || x.firstSeen - y.firstSeen)
  const L: string[] = []
  L.push('ASTERON GROUND: DAILY HANDOVER')
  L.push(`Generated (ground clock): ${new Date(a.now).toISOString()}   Link profile: ${a.profile}`)
  L.push('')
  L.push('CREW (worst first)')
  for (const c of crew) {
    if (c.dataAgeMs === null) { L.push(`- ${c.name}: UNKNOWN (no data received)`); continue }
    const age = `data ${hours(c.dataAgeMs)} old`
    const shown = c.stale ? `UNKNOWN (stale; last known ${String(c.lastKnownStatus).toUpperCase()})` : c.shownStatus.toUpperCase()
    const extra = [c.tier ? `tier ${c.tier}` : '', c.directive === 'onboard-protocol' ? 'crew is following the on-board protocol' : '', c.openAlerts ? `${c.openAlerts} open alert(s)` : '']
      .filter(Boolean).join(', ')
    const dose = c.dose ? `, career dose ${c.dose.careerMsv.toFixed(1)} mSv (${Math.round(c.dose.careerFraction * 100)}% of 600)` : ''
    L.push(`- ${c.name}: ${shown}, ${age}${extra ? `, ${extra}` : ''}${dose}`)
  }
  L.push('')
  L.push('OPEN ALERTS')
  if (!openAlerts.length) L.push('- None.')
  for (const x of openAlerts) L.push(`- [${x.status.toUpperCase()}] ${x.crewId} ${x.ruleId} (${x.state}, seen ${x.count}x): ${x.reason}`)
  L.push('')
  L.push('LINK SECURITY')
  L.push(`- Rejected bundles: ${a.rejected}`)
  L.push(`- Audit chain: ${a.auditOk ? 'intact' : 'BROKEN - investigate'}`)
  L.push('')
  L.push('Self-support aid, not a medical diagnosis. Station and Ground crew data is simulated.')
  return { at: a.now, crew, openAlerts, text: L.join('\n') }
}

/** Crew heatmap (K3): rows are crew, columns are the six body systems. Stale crew show unknown. */
export function heatmap(crew: CrewOverview[]) {
  return {
    columns: [...SYSTEMS],
    rows: crew.map((c) => ({
      crewId: c.crewId,
      name: c.name,
      cells: SYSTEMS.map((s) => ({ systemId: s, status: c.stale ? 'unknown' : (c.systems[s] ?? 'unknown') })),
    })),
  }
}
