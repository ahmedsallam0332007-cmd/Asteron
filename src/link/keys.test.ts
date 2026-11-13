import { describe, expect, it } from 'vitest'
import { exportPublic, importPublic, provisionPair } from './keys'
import { makeBundle } from './protocol'
import { open, ReplayGuard, seal } from './security'

const bundle = (kind: 'alert' | 'advice', seq = 1) =>
  makeBundle({ id: `b${seq}-${kind}`, seq, kind, crewId: 'rahal', createdAt: 1_700_000_000_000, payload: { text: `${kind} payload`, n: seq } })

describe('pre-flight key provisioning (pinned identities, one key per direction)', () => {
  it('station -> ground (downlink) opens on the ground', async () => {
    const { station, ground } = await provisionPair()
    const s = await seal(await bundle('alert'), station.identity, station.sendKey)
    const r = await open(s, ground.pinned, async () => ground.receiveKey, new ReplayGuard())
    expect(r.ok).toBe(true)
  })
  it('ground -> station (uplink) opens on the station', async () => {
    const { station, ground } = await provisionPair()
    const s = await seal(await bundle('advice'), ground.identity, ground.sendKey)
    const r = await open(s, station.pinned, async () => station.receiveKey, new ReplayGuard())
    expect(r.ok).toBe(true)
    if (r.ok) expect(JSON.parse(r.bundle.payload)).toEqual({ n: 1, text: 'advice payload' })
  })
  it('the uplink key cannot open downlink traffic (key separation)', async () => {
    const { station, ground } = await provisionPair()
    const s = await seal(await bundle('alert'), station.identity, station.sendKey)
    const r = await open(s, ground.pinned, async () => ground.sendKey, new ReplayGuard())
    expect(r).toEqual({ ok: false, reason: 'decrypt-failed' })
  })
  it('a bundle signed by the station is refused if it claims to come from the ground', async () => {
    const { station, ground } = await provisionPair()
    const s = await seal(await bundle('advice'), station.identity, station.sendKey)
    const forged = { ...s, header: { ...s.header, src: ground.identity.name } }
    const r = await open(forged, station.pinned, async () => station.receiveKey, new ReplayGuard())
    expect(r.ok).toBe(false)
  })
  it('both sides see the same fingerprints for each other', async () => {
    const { station, ground } = await provisionPair()
    expect(station.fingerprints.self).toBe(ground.fingerprints.peer)
    expect(ground.fingerprints.self).toBe(station.fingerprints.peer)
    expect(station.fingerprints.self).toMatch(/^([0-9a-f]{2}:){7}[0-9a-f]{2}$/)
  })
  it('public keys survive export to JSON and import (how the pairing record travels); private keys never leave', async () => {
    const { station, ground } = await provisionPair()
    const json = JSON.stringify(await exportPublic(station.identity))
    expect(json).not.toMatch(/"d"/) // JWK private component
    const imported = await importPublic(JSON.parse(json))
    const s = await seal(await bundle('alert'), station.identity, station.sendKey)
    const r = await open(s, new Map([[imported.name, imported]]), async () => ground.receiveKey, new ReplayGuard())
    expect(r.ok).toBe(true)
    await expect(crypto.subtle.exportKey('jwk', station.identity.sign.privateKey)).rejects.toThrow()
  })
})
