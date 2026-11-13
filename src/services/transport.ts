import type { SealedBundle } from '../link/security'

/** A sealed bundle travelling between the two sides. It is handed over only once its arrival time has passed. */
export interface Envelope { dir: 'down' | 'up'; arrivesAt: number; sealed: SealedBundle }
export interface Transport {
  post(e: Envelope): void
  /** Demo hooks: lose, or alter in transit, the next `n` envelopes sent in a direction. */
  dropNext(dir: Envelope['dir'], n: number): void
  tamperNext(dir: Envelope['dir'], n: number): void
  /** Envelopes for this direction that have arrived by `missionNow`, in arrival order. */
  due(dir: Envelope['dir'], missionNow: number): Envelope[]
  inFlight(dir: Envelope['dir']): number
  close(): void
}

/** Flips one character of the ciphertext, as an attacker or a corrupted channel would. */
export function tamper(e: Envelope): Envelope {
  const ct = e.sealed.ct
  if (!ct) return e
  const i = Math.floor(ct.length / 2)
  const swapped = ct[i] === 'A' ? 'B' : 'A'
  return { ...e, sealed: { ...e.sealed, ct: ct.slice(0, i) + swapped + ct.slice(i + 1) } }
}

/** Shared drop/tamper bookkeeping for outgoing envelopes. Returns the envelope to send, or null to lose it. */
class Faults {
  private drops: Record<Envelope['dir'], number> = { down: 0, up: 0 }
  private tampers: Record<Envelope['dir'], number> = { down: 0, up: 0 }
  drop(dir: Envelope['dir'], n: number) { this.drops[dir] += n }
  tamper(dir: Envelope['dir'], n: number) { this.tampers[dir] += n }
  apply(e: Envelope): Envelope | null {
    if (this.drops[e.dir] > 0) { this.drops[e.dir]--; return null }
    if (this.tampers[e.dir] > 0) { this.tampers[e.dir]--; return tamper(e) }
    return e
  }
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
  private faults = new Faults()
  post(e: Envelope) {
    const out = this.faults.apply(e)
    if (out) this.buf.push(out)
  }
  due(dir: Envelope['dir'], now: number) { return this.buf.due(dir, now) }
  inFlight(dir: Envelope['dir']) { return this.buf.count(dir) }
  dropNext(dir: Envelope['dir'], n: number) { this.faults.drop(dir, n) }
  tamperNext(dir: Envelope['dir'], n: number) { this.faults.tamper(dir, n) }
  close() {}
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
  private faults = new Faults()
  post(e: Envelope) {
    const out = this.faults.apply(e)
    if (out) this.ch.postMessage(out)
  }
  due(dir: Envelope['dir'], now: number) { return this.buf.due(dir, now) }
  inFlight(dir: Envelope['dir']) { return this.buf.count(dir) }
  dropNext(dir: Envelope['dir'], n: number) { this.faults.drop(dir, n) }
  tamperNext(dir: Envelope['dir'], n: number) { this.faults.tamper(dir, n) }
  close() { this.ch.close() }
}
