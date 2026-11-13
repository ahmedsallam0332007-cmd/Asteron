import type { Content } from '../content'
import type { CrewMember } from '../sim'
import type { Evaluation, Reading, SystemEvaluation, TierDecision } from '../engine/types'
import { SYSTEM_LABEL } from './systems'

export interface ReportInput {
  crew: CrewMember
  now: string
  evaluations: Evaluation[]
  systems: SystemEvaluation[]
  overall: { status: string; hasUnknown: boolean }
  tier: TierDecision
  readings: Reading[]
  content: Content
}

/** Plain-text report for the flight surgeon. Pure: same input, same text. */
export function buildReport(r: ReportInput): string {
  const tier = r.content.tiers.find((t) => t.tier === r.tier.tier)!
  const ind = (id: string) => r.content.indicators.find((i) => i.id === id)!
  const src = (id: string) => r.content.sources.find((s) => s.id === id)
  const lines: string[] = []
  lines.push(`ASTERON HEALTH REPORT`)
  lines.push(`Crew: ${r.crew.name} (${r.crew.bio.callsign}), age ${r.crew.bio.age}, flight day ${r.crew.bio.flightDay}`)
  lines.push(`Generated: ${r.now}`)
  lines.push(`Overall status: ${r.overall.status.toUpperCase()}${r.overall.hasUnknown ? ' (some readings missing)' : ''}`)
  lines.push(`Escalation: Tier ${tier.tier} - ${tier.label}`)
  lines.push('')
  lines.push('SYSTEMS')
  for (const s of r.systems) lines.push(`- ${SYSTEM_LABEL[s.systemId]}: ${s.status}`)
  lines.push('')
  lines.push('LATEST READINGS')
  for (const e of r.evaluations) {
    const series = r.readings.filter((x) => x.indicatorId === e.indicatorId).sort((a, b) => a.takenAt.localeCompare(b.takenAt))
    const last = series[series.length - 1]
    const prov = last?.provenance?.kind ?? 'unknown'
    lines.push(`- ${ind(e.indicatorId).label}: ${last ? `${last.value} ${ind(e.indicatorId).unit} [${prov}]` : 'no reading'} -> ${e.status}`)
  }
  const fired = r.evaluations.flatMap((e) => e.fired)
  const seen = new Set<string>()
  lines.push('')
  lines.push('WHY (rules that fired)')
  if (!fired.length) lines.push('- None.')
  for (const f of fired) {
    if (seen.has(f.ruleId)) continue
    seen.add(f.ruleId)
    lines.push(`- [${f.ruleId}] ${f.reason}`)
    lines.push(`  Sources: ${f.sourceIds.map((s) => src(s)?.title ?? s).join('; ')}`)
  }
  lines.push('')
  lines.push('ACTIONS')
  for (const a of tier.actions) lines.push(`- ${a}`)
  for (const reason of r.tier.reasons) lines.push(`- Note: ${reason}`)
  lines.push('')
  lines.push('Self-support aid, not a medical diagnosis. Thresholds come from published sources; the status mapping is by Team Asteron and has not been reviewed by a clinician. All crew data is simulated.')
  return lines.join('\n')
}
