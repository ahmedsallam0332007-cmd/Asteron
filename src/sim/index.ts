import crewJson from '../content/crew.json'
import type { CrewMember, Scenario } from './generator'

export * from './generator'
const ORDER = ['healthy', 'sleep-loss', 'bp-rise', 'infection', 'msk-decline', 'urgent', 'outage']
export const CREW = crewJson as unknown as CrewMember[]
export const SCENARIOS: Scenario[] = Object.values(
  import.meta.glob<Scenario>('../content/scenarios/*.json', { eager: true, import: 'default' }),
).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
