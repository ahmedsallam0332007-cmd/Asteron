/**
 * Store-and-forward bundles, modelled on NASA's Delay/Disruption Tolerant Networking
 * (Bundle Protocol, RFC 9171): every event is stored first, sent when a window allows,
 * highest priority first, resumed across windows, verified by SHA-256, acknowledged (custody).
 */
/** Downlink (station -> ground): alert, report, checkin, dose, journal, heartbeat, raw.
 *  Uplink (ground -> station): space-weather, advice, ack (custody signal). */
export type BundleKind = 'alert' | 'report' | 'checkin' | 'dose' | 'journal' | 'heartbeat' | 'raw' | 'space-weather' | 'advice' | 'ack'
export const PRIORITY: Record<BundleKind, 0 | 1 | 2 | 3> = {
  alert: 3, 'space-weather': 3, report: 2, advice: 2, ack: 2, checkin: 1, dose: 1, journal: 1, heartbeat: 0, raw: 0,
}

export interface Bundle {
  id: string
  seq: number
  kind: BundleKind
  priority: 0 | 1 | 2 | 3
  crewId: string
  createdAt: number
  bytes: number
  sha256: string
  payload: string // canonical JSON (or a size-only placeholder for raw data)
}

export interface OutboxEntry { bundle: Bundle; sentBytes: number; state: 'queued' | 'sending' | 'sent' | 'acked' }
export interface Transmission { id: string; from: number; to: number; complete: boolean }

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const canonical = (v: unknown): string =>
  v === null || typeof v !== 'object'
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(canonical).join(',')}]`
      : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`

export async function makeBundle(args: { id: string; seq: number; kind: BundleKind; crewId: string; createdAt: number; payload: unknown; bytesOverride?: number }): Promise<Bundle> {
  const payload = canonical(args.payload)
  return {
    id: args.id, seq: args.seq, kind: args.kind, priority: PRIORITY[args.kind], crewId: args.crewId, createdAt: args.createdAt,
    payload, bytes: args.bytesOverride ?? new TextEncoder().encode(payload).length, sha256: await sha256Hex(payload),
  }
}

/** Order: priority high to low, then oldest first. Acked or fully sent bundles are skipped. */
export function sendOrder(outbox: OutboxEntry[]) {
  return outbox
    .filter((e) => e.state === 'queued' || e.state === 'sending')
    .sort((a, b) => b.bundle.priority - a.bundle.priority || a.bundle.seq - b.bundle.seq)
}

/**
 * Fills one contact window of `capacityBytes`. Bundles that do not fit are sent in part
 * and resumed in the next window from the byte where they stopped.
 */
export function planWindow(outbox: OutboxEntry[], capacityBytes: number): { transmissions: Transmission[]; outbox: OutboxEntry[]; usedBytes: number } {
  let left = capacityBytes
  const next = new Map(outbox.map((e) => [e.bundle.id, { ...e }]))
  const transmissions: Transmission[] = []
  for (const e of sendOrder(outbox)) {
    if (left <= 0) break
    const remaining = e.bundle.bytes - e.sentBytes
    const n = Math.min(remaining, left)
    const to = e.sentBytes + n
    transmissions.push({ id: e.bundle.id, from: e.sentBytes, to, complete: to === e.bundle.bytes })
    next.set(e.bundle.id, { ...e, sentBytes: to, state: to === e.bundle.bytes ? 'sent' : 'sending' })
    left -= n
  }
  return { transmissions, outbox: [...next.values()], usedBytes: capacityBytes - left }
}

/** Ground side: verifies the checksum, ignores duplicates, returns what to acknowledge. */
export async function receive(received: Map<string, Bundle>, incoming: Bundle[]) {
  const accepted: Bundle[] = []
  const rejected: { id: string; reason: string }[] = []
  const ack: string[] = []
  for (const b of incoming) {
    if (received.has(b.id)) { ack.push(b.id); continue } // duplicate: acknowledge again, do not store twice
    if (b.kind !== 'raw' && (await sha256Hex(b.payload)) !== b.sha256) { rejected.push({ id: b.id, reason: 'SHA-256 mismatch: altered or corrupted in transit' }); continue }
    received.set(b.id, b)
    accepted.push(b)
    ack.push(b.id)
  }
  return { accepted, rejected, ack }
}

/** Station side: custody released only for acknowledged bundles. */
export const applyAck = (outbox: OutboxEntry[], ack: string[]) =>
  outbox.map((e) => (ack.includes(e.bundle.id) ? { ...e, state: 'acked' as const } : e))

/** Ground view honesty: how old is what the flight surgeon sees. */
export const dataAgeMs = (b: Pick<Bundle, 'createdAt'>, groundNow: number) => groundNow - b.createdAt
