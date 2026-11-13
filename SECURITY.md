# Asteron security

Asteron moves health data across a link with minutes of delay and weeks of blackout. Internet-style
security (a TLS handshake) needs round trips the link cannot afford, so Asteron uses per-bundle
security with keys provisioned before flight, the approach of NASA's DTN stack:

| Layer | What we do | Standard it follows |
|---|---|---|
| Confidentiality + integrity | AES-GCM-256 per bundle, fresh 96-bit IV, header bound as additional authenticated data | BPSec default context BCB-AES-GCM (RFC 9173); CCSDS SDLS also uses AES-GCM |
| Origin authentication | ECDSA P-256 / SHA-256 signature over header + IV + ciphertext, sender key pinned before flight | — (adds non-repudiation for medical records) |
| Key separation | ECDH P-256 + HKDF-SHA-256, one key per direction (down / up) | — |
| Replay | each sequence number accepted once, for one bundle id only; exact duplicates acknowledged, not stored twice | DTN custody / idempotent delivery |
| Payload check | SHA-256 of the payload carried in the signed header | — |
| Audit | ground actions in a hash-chained log; any edit or deletion is located | — |
| Keys | generated inside Web Crypto, private keys non-extractable | — |
| Payload validation | after decryption, every payload is checked against a Zod schema for its kind; a valid signature does not make a payload trusted | input validation (OWASP) |
| Direction | the station accepts only uplink kinds, the ground only downlink kinds | — |
| Malformed input | garbage fields (bad base64, wrong IV length, missing header) are rejected as `malformed`, never crash a node | — |
| Pairing | each side keeps its private key in its own database; only public keys meet in the pre-flight record; a side that loses its identity re-pairs and the peer pins the new key | — |
| Rejections | every refused bundle is written to a rejected log and the audit chain with its reason | — |
| Web app | CSP allows only the app's own origin (no third-party scripts or network), no framing, device APIs disabled (`public/_headers`) | OWASP secure headers |

Not wire-compatible with BPSec/SDLS (they encode in CBOR; we use JSON). Not audited by a security
professional. Demo keys are generated in the browser; a real mission would provision them on secure
hardware before launch.

Tests: `src/link/security.test.ts` (13 tests: round trip, confidentiality, bit-flip, priority
downgrade, forged sender, unknown sender, replay, key separation, IV uniqueness, non-extractable keys,
audit chain) and `src/link/headers.test.ts`.

`npm audit --omit=dev` (code shipped to users): 0 known vulnerabilities on 13 Nov 2026.
