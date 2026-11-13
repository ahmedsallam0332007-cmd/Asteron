import type { SealedBundle } from '../link/security'

/** A sealed bundle travelling between the two sides. It is handed over only once its arrival time has passed. */
export interface Envelope { dir: 'down' | 'up'; arrivesAt: number; sealed: SealedBundle }
export interface Transport {
  post(e: Envelope): void
  /** Envelopes for this direction that have arrived by `missionNow`, in arrival order. */
  due(dir: Envelope['dir'], missionNow: number): Envelope[]
  inFlight(dir: Envelope['dir']): number
}

class Buffer {
  private items: Envelope[] = []
  push(e: Envelope) { this.items.push(e) }
  due(dir: Envelope['dir'], now: number) {
    const out = this.items.filter((e) => e.dir === dir && e.arrivesAt <= now).sort((a, b) => a.arrivesAt - b.arrivesAt)
    this.items = this.items.filter((e) => !out.includes(e))
    return out
  }
  count(dir: Envelope['dir']) { return this.items.filter((e) => e.dir === dir).length }
}

/** Both sides in one page (Mission page, tests). Zero network. Can simulate a loss in transit. */
export class LoopbackTransport implements Transport {
  private buf = new Buffer()
  private drops: Record<Envelope['dir'], number> = { down: 0, up: 0 }
  post(e: Envelope) {
    if (this.drops[e.dir] > 0) { this.drops[e.dir]--; return }
    this.buf.push(e)
  }
  due(dir: Envelope['dir'], now: number) { return this.buf.due(dir, now) }
  inFlight(dir: Envelope['dir']) { return this.buf.count(dir) }
  /** Test and demo hook: lose the next `n` envelopes in this direction. */
  dropNext(dir: Envelope['dir'], n: number) { this.drops[dir] += n }
}

const isEnvelope = (m: unknown): m is Envelope => {
  const e = m as Envelope
  return !!e && (e.dir === 'down' || e.dir === 'up') && typeof e.arrivesAt === 'number' && Number.isFinite(e.arrivesAt)
    && !!e.sealed && typeof e.sealed === 'object' && !!e.sealed.header && typeof e.sealed.ct === 'string' && typeof e.sealed.sig === 'string'
}

/**
 * Station in one window, Ground in another, same browser. Zero network.
 * Anything that is not a well-formed envelope is ignored; real checks happen when the bundle is opened.
 */
export class BroadcastTransport implements Transport {
  private ch: BroadcastChannel
  private buf = new Buffer()
  constructor(name = 'asteron-link') {
    this.ch = new BroadcastChannel(name)
    this.ch.onmessage = (ev: MessageEvent) => { if (isEnvelope(ev.data)) this.buf.push(ev.data) }
  }
  post(e: Envelope) { this.ch.postMessage(e) }
  due(dir: Envelope['dir'], now: number) { return this.buf.due(dir, now) }
  inFlight(dir: Envelope['dir']) { return this.buf.count(dir) }
  close() { this.ch.close() }
}
