import { advanceLink } from '../link/channel'
import { oneWaySeconds } from '../link/contactPlan'
import type { ProfileId } from '../link/profiles'
import type { OutboxRecord } from '../data/db'
import type { GroundNode, GroundReceive } from '../ground/node'
import type { ReceiveResult, StationNode } from '../station/node'
import type { Envelope, Transport } from './transport'

/** Extra time allowed for an acknowledgement beyond the round trip (Team Asteron setting). */
export const CUSTODY_MARGIN_MS = 10 * 60_000

interface Side {
  queue(): Promise<OutboxRecord[]>
  progress(q: OutboxRecord[], launches: { id: string; completedAt: number }[]): Promise<void>
  requeueUnacked(nowMs: number, timeoutMs: number): Promise<number>
}

export type Delivered = ({ id: string; kind?: string; arrivesAt: number } & ({ ok: true } | { ok: false; reason: string }))

/**
 * Drives one link between the two sides. Each tick, in order:
 *  1. hand over bundles whose arrival time has passed,
 *  2. re-queue bundles whose acknowledgement is overdue (custody),
 *  3. move bytes down and up through the contact windows (unless the link is cut),
 *  4. hand over anything that arrived during this tick.
 * A cut stops new transmissions; bundles already travelling still arrive.
 */
export class Mission {
  private readonly station?: StationNode
  private readonly ground?: GroundNode
  private readonly transport: Transport
  private readonly profile: () => ProfileId
  private last: number
  private cut = false

  /** Pass both nodes for one page, or only one for a station window or a ground window. */
  constructor(deps: { station?: StationNode; ground?: GroundNode; transport: Transport; profile: () => ProfileId; start: number }) {
    this.station = deps.station
    this.ground = deps.ground
    this.transport = deps.transport
    this.profile = deps.profile
    this.last = deps.start
  }

  async init() { await this.station?.init(); await this.ground?.init() }
  setCut(v: boolean) { this.cut = v }
  isCut() { return this.cut }
  lastTick() { return this.last }

  custodyTimeoutMs(at: number) { return 2 * oneWaySeconds(this.profile(), at).sec * 1000 + CUSTODY_MARGIN_MS }

  private async deliver(now: number, out: { down: Delivered[]; up: Delivered[] }) {
    if (this.ground) for (const e of this.transport.due('down', now)) out.down.push(this.result(e, await this.ground.receive(e.sealed, e.arrivesAt)))
    if (this.station) for (const e of this.transport.due('up', now)) out.up.push(this.result(e, await this.station.receive(e.sealed, e.arrivesAt)))
  }

  private result(e: Envelope, r: GroundReceive | ReceiveResult): Delivered {
    const id = String(e.sealed?.header?.id ?? '?')
    return r.ok ? { id, kind: r.kind, arrivesAt: e.arrivesAt, ok: true } : { id, kind: e.sealed?.header?.kind, arrivesAt: e.arrivesAt, ok: false, reason: r.reason }
  }

  private async move(side: Side, dir: Envelope['dir'], from: number, to: number) {
    const queue = await side.queue()
    if (!queue.length) return
    const r = advanceLink({ profile: this.profile(), from, to, queue, cut: this.cut })
    await side.progress(r.queue, r.launches)
    const byId = new Map(r.queue.map((q) => [q.id, q]))
    for (const l of r.launches) this.transport.post({ dir, arrivesAt: l.arrivesAt, sealed: byId.get(l.id)!.sealed })
  }

  async tick(now: number) {
    if (now < this.last) throw new Error('Mission time must not run backwards')
    const out = { down: [] as Delivered[], up: [] as Delivered[] }
    await this.deliver(now, out)
    const timeout = this.custodyTimeoutMs(now)
    await this.station?.requeueUnacked(now, timeout)
    await this.ground?.requeueUnacked(now, timeout)
    if (this.station) await this.move(this.station, 'down', this.last, now)
    if (this.ground) await this.move(this.ground, 'up', this.last, now)
    await this.deliver(now, out)
    this.last = now
    return out
  }
}
