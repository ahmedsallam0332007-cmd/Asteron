import { createIdentity, deriveLinkKey, fingerprint, publicOf, type NodeIdentity, type PublicIdentity } from './security'

/**
 * Pre-flight key provisioning. Before launch, the station and the ground segment each generate
 * their own key pairs (private keys non-extractable) and exchange ONLY public keys. Each side pins
 * the other's public key. From then on no handshake is ever needed over the delayed link.
 */
export interface LinkKeys {
  identity: NodeIdentity
  /** Peer public identity, pinned by name. */
  pinned: Map<string, PublicIdentity>
  peerName: string
  sendKey: CryptoKey
  receiveKey: CryptoKey
  fingerprints: { self: string; peer: string }
}

export const STATION_NAME = 'asteron-station'
export const GROUND_NAME = 'asteron-ground'

/** Keys for one side, given its own identity and the peer's pinned public identity. */
export async function keysFor(identity: NodeIdentity, peer: PublicIdentity, role: 'station' | 'ground'): Promise<LinkKeys> {
  const down = await deriveLinkKey(identity, peer, 'down')
  const up = await deriveLinkKey(identity, peer, 'up')
  return {
    identity,
    pinned: new Map([[peer.name, peer]]),
    peerName: peer.name,
    sendKey: role === 'station' ? down : up,
    receiveKey: role === 'station' ? up : down,
    fingerprints: { self: await fingerprint(identity.sign.publicKey), peer: await fingerprint(peer.sign) },
  }
}

export async function provisionPair(): Promise<{ station: LinkKeys; ground: LinkKeys }> {
  const s = await createIdentity(STATION_NAME)
  const g = await createIdentity(GROUND_NAME)
  return { station: await keysFor(s, publicOf(g), 'station'), ground: await keysFor(g, publicOf(s), 'ground') }
}

export interface PublicRecord { name: string; sign: JsonWebKey; agree: JsonWebKey }
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const

export async function exportPublic(id: NodeIdentity): Promise<PublicRecord> {
  return { name: id.name, sign: await crypto.subtle.exportKey('jwk', id.sign.publicKey), agree: await crypto.subtle.exportKey('jwk', id.agree.publicKey) }
}
export async function importPublic(r: PublicRecord): Promise<PublicIdentity> {
  if (r.sign.d || r.agree.d) throw new Error('A pairing record must not contain private key material')
  return {
    name: r.name,
    sign: await crypto.subtle.importKey('jwk', r.sign, ECDSA, true, ['verify']),
    agree: await crypto.subtle.importKey('jwk', r.agree, ECDH, true, []),
  }
}
