import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { GroundDB, StationDB } from '../data/db'
import { PreflightDB, ensureKeys } from './pairing'
import { makeBundle } from './protocol'
import { open, ReplayGuard, seal } from './security'

const uniq = () => `${Date.now()}-${Math.random()}`

describe('persistent pre-flight pairing (each side keeps its own private key; only public keys are exchanged)', () => {
  it('both sides get working keys; the station can talk to the ground', async () => {
    const id = uniq()
    const sdb = new StationDB(`st-${id}`), gdb = new GroundDB(`gr-${id}`), pf = new PreflightDB(`pf-${id}`)
    const s = await ensureKeys('station', sdb, pf)
    const g = await ensureKeys('ground', gdb, pf)
    const s2 = s ?? (await ensureKeys('station', sdb, pf))
    expect(s2 && g).toBeTruthy()
    const b = await makeBundle({ id: 'x', seq: 1, kind: 'checkin', crewId: 'rahal', createdAt: 1, payload: { a: 1 } })
    const r = await open(await seal(b, s2!.identity, s2!.sendKey), g!.pinned, async () => g!.receiveKey, new ReplayGuard())
    expect(r.ok).toBe(true)
  })
  it('a side returns null until its peer has published a public key', async () => {
    const id = uniq()
    expect(await ensureKeys('station', new StationDB(`st-${id}`), new PreflightDB(`pf-${id}`))).toBeNull()
  })
  it('identities persist: a reload gives the same fingerprints, so bundles sealed before the reload still open', async () => {
    const id = uniq()
    const sdb = new StationDB(`st-${id}`), gdb = new GroundDB(`gr-${id}`), pf = new PreflightDB(`pf-${id}`)
    await ensureKeys('station', sdb, pf)
    const g1 = (await ensureKeys('ground', gdb, pf))!
    const s1 = (await ensureKeys('station', sdb, pf))!
    const sealed = await seal(await makeBundle({ id: 'y', seq: 2, kind: 'checkin', crewId: 'rahal', createdAt: 1, payload: { b: 2 } }), s1.identity, s1.sendKey)
    const s2 = (await ensureKeys('station', sdb, pf))!
    const g2 = (await ensureKeys('ground', gdb, pf))!
    expect(s2.fingerprints).toEqual(s1.fingerprints)
    expect(g2.fingerprints).toEqual(g1.fingerprints)
    expect((await open(sealed, g2.pinned, async () => g2.receiveKey, new ReplayGuard())).ok).toBe(true)
  })
  it('the pre-flight record holds public keys only', async () => {
    const id = uniq()
    const pf = new PreflightDB(`pf-${id}`)
    await ensureKeys('station', new StationDB(`st-${id}`), pf)
    const rows = await pf.publicKeys.toArray()
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toMatch(/"d":/)
  })
  it('if a side loses its identity, it re-pairs: the new public key replaces the old one and the peer pins the new key', async () => {
    const id = uniq()
    const sdb = new StationDB(`st-${id}`), gdb = new GroundDB(`gr-${id}`), pf = new PreflightDB(`pf-${id}`)
    await ensureKeys('station', sdb, pf)
    await ensureKeys('ground', gdb, pf)
    await sdb.settings.delete('link.identity')
    const s = (await ensureKeys('station', sdb, pf))!
    const g = (await ensureKeys('ground', gdb, pf))!
    const sealed = await seal(await makeBundle({ id: 'z', seq: 3, kind: 'checkin', crewId: 'rahal', createdAt: 1, payload: { c: 3 } }), s.identity, s.sendKey)
    expect((await open(sealed, g.pinned, async () => g.receiveKey, new ReplayGuard())).ok).toBe(true)
  })
})
