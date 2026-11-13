/**
 * Link security for a delayed, disrupted link. Modelled on BPSec (RFC 9172) and its default
 * contexts (RFC 9173, BCB-AES-GCM) and on CCSDS SDLS, which also uses AES-GCM.
 * Not wire-compatible with those standards (they encode in CBOR; we use JSON).
 *
 * Why per-bundle security and pre-provisioned keys: an internet-style handshake (TLS) needs
 * several round trips; at Mars one round trip can take 44 minutes and a conjunction blocks
 * the link for two weeks. So keys are agreed before flight, and every bundle protects itself.
 *
 *  - Confidentiality + integrity: AES-GCM-256, fresh 96-bit IV per bundle, header bound as AAD.
 *  - Origin authentication: ECDSA P-256 / SHA-256 signature by the station's pinned key.
 *  - Key separation: ECDH P-256 + HKDF-SHA-256, one key per direction.
 *  - Replay: each sequence number is accepted once, for one bundle id only.
 *  - Private keys are generated non-extractable inside Web Crypto.
 */
import type { Bundle } from './protocol'

const enc = new TextEncoder()
const dec = new TextDecoder()
const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u instanceof Uint8Array ? u : new Uint8Array(u))))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const

export interface NodeIdentity {
  name: string
  sign: CryptoKeyPair
  agree: CryptoKeyPair
}
export interface PublicIdentity { name: string; sign: CryptoKey; agree: CryptoKey }

export async function createIdentity(name: string): Promise<NodeIdentity> {
  return {
    name,
    sign: (await crypto.subtle.generateKey(ECDSA, false, ['sign', 'verify'])) as CryptoKeyPair,
    agree: (await crypto.subtle.generateKey(ECDH, false, ['deriveBits'])) as CryptoKeyPair,
  }
}
export const publicOf = (id: NodeIdentity): PublicIdentity => ({ name: id.name, sign: id.sign.publicKey, agree: id.agree.publicKey })

/** Short fingerprint of a public signing key, for pinning and display. */
export async function fingerprint(key: CryptoKey) {
  const raw = await crypto.subtle.exportKey('raw', key)
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', raw))
  return [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(':')
}

/** One AES-GCM-256 key per direction, from ECDH P-256 + HKDF-SHA-256. */
export async function deriveLinkKey(mine: NodeIdentity, peer: PublicIdentity, direction: 'down' | 'up') {
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer.agree }, mine.agree.privateKey, 256)
  const hk = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('asteron-link-v1'), info: enc.encode(`asteron/${direction}`) },
    hk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export type Header = Pick<Bundle, 'id' | 'seq' | 'kind' | 'priority' | 'crewId' | 'createdAt' | 'bytes' | 'sha256'> & { src: string; alg: 'A256GCM+ES256' }
export interface SealedBundle { header: Header; iv: string; ct: string; sig: string }

const headerBytes = (h: Header) => enc.encode(JSON.stringify(h, Object.keys(h).sort()))
const signedBytes = (h: Header, iv: Uint8Array, ct: Uint8Array) => {
  const hb = headerBytes(h)
  const out = new Uint8Array(hb.length + iv.length + ct.length)
  out.set(hb); out.set(iv, hb.length); out.set(ct, hb.length + iv.length)
  return out
}

/** Encrypts the payload (header as AAD) and signs header+IV+ciphertext. */
export async function seal(b: Bundle, station: NodeIdentity, downKey: CryptoKey): Promise<SealedBundle> {
  const header: Header = { id: b.id, seq: b.seq, kind: b.kind, priority: b.priority, crewId: b.crewId, createdAt: b.createdAt, bytes: b.bytes, sha256: b.sha256, src: station.name, alg: 'A256GCM+ES256' }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: headerBytes(header), tagLength: 128 }, downKey, enc.encode(b.payload)))
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, station.sign.privateKey, signedBytes(header, iv, ct))
  return { header, iv: b64(iv), ct: b64(ct), sig: b64(sig) }
}

export class ReplayGuard {
  private seqToId = new Map<number, string>()
  /** 'new' = first time; 'duplicate' = same bundle again (acknowledge, do not store); 'replay' = seq reused by another id. */
  check(h: Header): 'new' | 'duplicate' | 'replay' {
    const seen = this.seqToId.get(h.seq)
    if (seen === undefined) { this.seqToId.set(h.seq, h.id); return 'new' }
    return seen === h.id ? 'duplicate' : 'replay'
  }
}

export type OpenResult =
  | { ok: true; bundle: Bundle; duplicate: boolean }
  | { ok: false; reason: 'bad-signature' | 'decrypt-failed' | 'replay' | 'unknown-sender' | 'hash-mismatch' | 'malformed' }

/** Ground side: check sender, signature, replay, then decrypt and check the payload hash. */
export async function open(s: SealedBundle, pinned: Map<string, PublicIdentity>, upKeyFor: (src: string) => Promise<CryptoKey>, guard: ReplayGuard): Promise<OpenResult> {
  if (!s || typeof s !== 'object' || !s.header || typeof s.header !== 'object') return { ok: false, reason: 'malformed' }
  const sender = pinned.get(s.header.src)
  if (!sender) return { ok: false, reason: 'unknown-sender' }
  let iv: ReturnType<typeof unb64>, ct: ReturnType<typeof unb64>, sig: ReturnType<typeof unb64>
  try {
    iv = unb64(s.iv); ct = unb64(s.ct); sig = unb64(s.sig)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (iv.length !== 12 || sig.length === 0) return { ok: false, reason: 'malformed' }
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, sender.sign, sig, signedBytes(s.header, iv, ct))
  if (!valid) return { ok: false, reason: 'bad-signature' }
  const r = guard.check(s.header)
  if (r === 'replay') return { ok: false, reason: 'replay' }
  let payload: string
  try {
    payload = dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: headerBytes(s.header), tagLength: 128 }, await upKeyFor(s.header.src), ct))
  } catch {
    return { ok: false, reason: 'decrypt-failed' }
  }
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(payload)))
  if ([...h].map((x) => x.toString(16).padStart(2, '0')).join('') !== s.header.sha256) return { ok: false, reason: 'hash-mismatch' }
  const { src: _src, alg: _alg, ...rest } = s.header
  return { ok: true, duplicate: r === 'duplicate', bundle: { ...rest, payload } }
}

/** Tamper-evident audit log: each entry carries the SHA-256 of the previous one. */
export interface AuditEntry { at: number; actor: string; action: string; detail: string; prev: string; hash: string }
const hashHex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('')
const entryText = (e: Omit<AuditEntry, 'hash'>) => JSON.stringify([e.at, e.actor, e.action, e.detail, e.prev])
export async function appendAudit(log: AuditEntry[], e: Omit<AuditEntry, 'prev' | 'hash'>): Promise<AuditEntry[]> {
  const prev = log.length ? log[log.length - 1].hash : '0'.repeat(64)
  const base = { ...e, prev }
  return [...log, { ...base, hash: await hashHex(entryText(base)) }]
}
/** Returns -1 if the chain is intact, else the index of the first broken entry. */
export async function verifyAudit(log: AuditEntry[]): Promise<number> {
  let prev = '0'.repeat(64)
  for (let i = 0; i < log.length; i++) {
    const e = log[i]
    if (e.prev !== prev || (await hashHex(entryText(e))) !== e.hash) return i
    prev = e.hash
  }
  return -1
}
