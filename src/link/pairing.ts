import Dexie, { type Table } from 'dexie'
import type { GroundDB, StationDB } from '../data/db'
import { exportPublic, GROUND_NAME, importPublic, keysFor, STATION_NAME, type LinkKeys, type PublicRecord } from './keys'
import { createIdentity, type NodeIdentity } from './security'

/**
 * The pre-flight pairing record: public keys only, exchanged before launch.
 * Neither side's health data is here; each side's private key stays in its own database.
 */
export class PreflightDB extends Dexie {
  publicKeys!: Table<PublicRecord, string>
  constructor(name = 'asteron-preflight') {
    super(name)
    this.version(1).stores({ publicKeys: 'name' })
  }
}

const IDENTITY_KEY = 'link.identity'

async function loadOrCreate(db: StationDB | GroundDB, name: string): Promise<NodeIdentity> {
  const stored = (await db.settings.get(IDENTITY_KEY))?.value as NodeIdentity | undefined
  if (stored?.sign?.privateKey && stored.name === name) return stored
  const id = await createIdentity(name)
  await db.settings.put({ key: IDENTITY_KEY, value: id }) // CryptoKeys are stored as-is; private keys stay non-extractable
  return id
}

/** Loads (or creates) this side's identity, publishes its public key, and pins the peer once it has published. */
export async function ensureKeys(role: 'station' | 'ground', own: StationDB | GroundDB, preflight: PreflightDB): Promise<LinkKeys | null> {
  const me = role === 'station' ? STATION_NAME : GROUND_NAME
  const peer = role === 'station' ? GROUND_NAME : STATION_NAME
  const identity = await loadOrCreate(own, me)
  const mine = await exportPublic(identity)
  const published = await preflight.publicKeys.get(me)
  if (!published || JSON.stringify(published.sign) !== JSON.stringify(mine.sign) || JSON.stringify(published.agree) !== JSON.stringify(mine.agree)) {
    await preflight.publicKeys.put(mine) // first pairing, or re-pairing after this side lost its identity
  }
  const peerRec = await preflight.publicKeys.get(peer)
  if (!peerRec) return null
  return keysFor(identity, await importPublic(peerRec), role)
}
