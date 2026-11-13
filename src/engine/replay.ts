import { assess } from './index'
import type { Content } from '../content'
import type { Reading, Status, SystemId } from './types'

/** Mission Replay (K1): the pure engine re-run at each step. A frame only sees readings up to its own time. */
export interface ReplayFrame { at: string; overall: Status; tier: 1 | 2 | 3 | 4; systems: Record<SystemId, Status>; fired: string[] }

export function replay(content: Pick<Content, 'indicators' | 'rules'>, readings: Reading[], start: string, end: string, stepMs = 86_400_000): ReplayFrame[] {
  const s = Date.parse(start), e = Date.parse(end)
  if (!(e >= s)) throw new Error('Replay end must not be before its start')
  if (!(stepMs > 0)) throw new Error('Replay step must be positive')
  const frames: ReplayFrame[] = []
  for (let t = s; t <= e; t += stepMs) {
    const at = new Date(t).toISOString()
    const a = assess(content, readings, at)
    frames.push({
      at,
      overall: a.overall.status,
      tier: a.tier.tier,
      systems: Object.fromEntries(a.systems.map((x) => [x.systemId, x.status])) as Record<SystemId, Status>,
      fired: [...new Set(a.evaluations.flatMap((ev) => ev.fired.map((f) => f.ruleId)))],
    })
  }
  return frames
}
