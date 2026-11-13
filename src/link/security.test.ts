import { describe, expect, it } from 'vitest'
import { makeBundle } from './protocol'
import { appendAudit, createIdentity, deriveLinkKey, fingerprint, open, publicOf, ReplayGuard, seal, verifyAudit, type SealedBundle } from './security'

async function setup() {
  const station = await createIdentity('station-asteron-1')
  const ground = await createIdentity('ground-houston')
  // Pre-flight provisioning: each side pins the other's public keys.
  const pinned = new Map([[station.name, publicOf(station)]])
  const downKeyStation = await deriveLinkKey(station, publicOf(ground), 'down')
  const downKeyGround = await deriveLinkKey(ground, publicOf(station), 'down')
  const alert = await makeBundle({ id: 'alert-1', seq: 7, kind: 'alert', crewId: 'rahal', createdAt: 1_794_000_000_000, payload: { status: 'urgent', rule: 'comp-infection-severe', spo2: 91 } })
  return { station, ground, pinned, downKeyStation, upKeyFor: async () => downKeyGround, alert }
}
const flip = (b64: string, i = 5) => { const u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); u[i] ^= 1; return btoa(String.fromCharCode(...u)) }

describe('link security (BPSec-style, AES-GCM-256 + ECDSA P-256)', () => {
  it('round trip: station seals, ground opens the same bundle', async () => {
    const s = await setup()
    const sealed = await seal(s.alert, s.station, s.downKeyStation)
    const r = await open(sealed, s.pinned, s.upKeyFor, new ReplayGuard())
    expect(r.ok && r.bundle.payload).toBe(s.alert.payload)
  })
  it('confidentiality: medical content is not readable in transit', async () => {
    const s = await setup()
    const sealed = await seal(s.alert, s.station, s.downKeyStation)
    const wire = JSON.stringify(sealed.ct) + atob(sealed.ct)
    expect(wire).not.toContain('urgent')
    expect(wire).not.toContain('spo2')
  })
  it('rejects a flipped bit in the ciphertext', async () => {
    const s = await setup()
    const sealed = await seal(s.alert, s.station, s.downKeyStation)
    const r = await open({ ...sealed, ct: flip(sealed.ct) }, s.pinned, s.upKeyFor, new ReplayGuard())
    expect(r).toEqual({ ok: false, reason: 'bad-signature' })
  })
  it('rejects a downgraded priority (urgent relabelled as raw) even though the payload is untouched', async () => {
    const s = await setup()
    const sealed = await seal(s.alert, s.station, s.downKeyStation)
    const forged: SealedBundle = { ...sealed, header: { ...sealed.header, priority: 0, kind: 'raw' } }
    expect((await open(forged, s.pinned, s.upKeyFor, new ReplayGuard())).ok).toBe(false)
  })
  it('rejects a forger who re-encrypts and signs with their own key', async () => {
    const s = await setup()
    const attacker = await createIdentity('station-asteron-1') // claims the station's name
    const key = await deriveLinkKey(attacker, publicOf(s.ground), 'down')
    const fake = await seal({ ...s.alert, payload: s.alert.payload.replace('urgent', 'normal') }, attacker, key)
    expect(await open(fake, s.pinned, s.upKeyFor, new ReplayGuard())).toEqual({ ok: false, reason: 'bad-signature' })
  })
  it('rejects an unknown sender', async () => {
    const s = await setup()
    const sealed = await seal(s.alert, s.station, s.downKeyStation)
    expect(await open({ ...sealed, header: { ...sealed.header, src: 'unknown' } }, s.pinned, s.upKeyFor, new ReplayGuard())).toEqual({ ok: false, reason: 'unknown-sender' })
  })
  it('duplicates are acknowledged once; a sequence number reused by another bundle is a replay', async () => {
    const s = await setup()
    const g = new ReplayGuard()
    const a = await seal(s.alert, s.station, s.downKeyStation)
    expect(await open(a, s.pinned, s.upKeyFor, g)).toMatchObject({ ok: true, duplicate: false })
    expect(await open(a, s.pinned, s.upKeyFor, g)).toMatchObject({ ok: true, duplicate: true })
    const other = await seal({ ...s.alert, id: 'alert-2' }, s.station, s.downKeyStation)
    expect(await open(other, s.pinned, s.upKeyFor, g)).toEqual({ ok: false, reason: 'replay' })
  })
  it('the uplink key cannot open downlink traffic (key separation per direction)', async () => {
    const s = await setup()
    const sealed = await seal(s.alert, s.station, s.downKeyStation)
    const upKey = await deriveLinkKey(s.ground, publicOf(s.station), 'up')
    expect(await open(sealed, s.pinned, async () => upKey, new ReplayGuard())).toEqual({ ok: false, reason: 'decrypt-failed' })
  })
  it('uses a fresh 96-bit IV for every bundle (1,000 seals, no repeat)', async () => {
    const s = await setup()
    const ivs = new Set<string>()
    for (let i = 0; i < 1000; i++) ivs.add((await seal({ ...s.alert, id: `a${i}`, seq: i }, s.station, s.downKeyStation)).iv)
    expect(ivs.size).toBe(1000)
  })
  it('private keys cannot be exported', async () => {
    const s = await setup()
    await expect(crypto.subtle.exportKey('pkcs8', s.station.sign.privateKey)).rejects.toBeTruthy()
    expect(await fingerprint(s.station.sign.publicKey)).toMatch(/^([0-9a-f]{2}:){7}[0-9a-f]{2}$/)
  })
})

describe('tamper-evident audit log', () => {
  it('detects an edited entry and points at it', async () => {
    let log = await appendAudit([], { at: 1, actor: 'ground', action: 'received', detail: 'alert-1 from rahal' })
    log = await appendAudit(log, { at: 2, actor: 'dr.surgeon', action: 'acknowledged', detail: 'alert-1' })
    log = await appendAudit(log, { at: 3, actor: 'dr.surgeon', action: 'resolved', detail: 'alert-1: advised rest' })
    expect(await verifyAudit(log)).toBe(-1)
    const edited = log.map((e, i) => (i === 1 ? { ...e, actor: 'someone-else' } : e))
    expect(await verifyAudit(edited)).toBe(1)
    expect(await verifyAudit(log.filter((_, i) => i !== 1))).toBe(1) // deleted entry
  })
})
