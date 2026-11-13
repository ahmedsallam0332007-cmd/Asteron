# Asteron system architecture

The system is complete and tested without any screen. The website is a view on top of it.

## Layers (each depends only on the ones below)

| # | Layer | Folder | What it does | Tests |
|---|---|---|---|---|
| 6 | Website | `src/ui` | Pages read the databases and call the store. No logic of its own. | browser scripts |
| 5 | Store | `src/store/system.ts` | Owns the running system, ticks the mission clock every second, exposes actions (cut, restore, fast-forward, reset, tamper). | `system.test.ts` |
| 4 | Services | `src/services`, `src/station`, `src/ground` | Station node, ground node, the link runtime, the mission clock, transports. | `node.test.ts` x2, `runtime.test.ts`, `fullLoop.test.ts` |
| 3 | Data | `src/data` | Two separate IndexedDB databases (station, ground) and the pre-flight pairing record. | `db2.test.ts`, `db.test.ts`, `checkin.test.ts` |
| 2 | Engines (pure) | `src/engine`, `src/link`, `src/sim`, `src/ground/alerts.ts` | Health rules, radiation, exercise plan, adaptation phase, replay, contact plan, link channel, protocol, security, alert lifecycle, handover. | vectors, property tests, unit tests |
| 1 | Content and real data | `src/content` | Indicators, rules, sources, radiation limits, NASA data with SHA-256. Validated with Zod at load. | `content.test.ts`, `stage1.test.ts`, `hazards.test.ts` |

## One check-in, end to end
```
Astronaut check-in (14 fields: vitals, sleep, mood, stress, workload, 4 symptoms)
  -> validate against plausible ranges (nothing saved if any value is impossible)
  -> save readings with provenance (SIM / MANUAL / JUDGE)
  -> engine: absolute + personal baseline + trend + composite rules -> systems -> tier 1-4
  -> link-aware decision: earliest possible answer from Earth (JPL Horizons light time,
     relay passes, solar conjunction) vs the longest wait this tier allows
     -> "follow tier" or "on-board protocol now"
  -> bundles: check-in (always); alert + report (tier 3-4)
  -> each bundle: canonical JSON -> SHA-256 -> AES-GCM-256 (header as AAD) -> ECDSA signature
  -> station outbox (nothing waits for the link)
Link runtime, every tick:
  -> only inside contact windows, never while cut, never during conjunction
  -> highest priority first; partial sends resume from the byte where they stopped
  -> arrival = last byte sent + light time at that moment
Ground:
  -> pinned sender? signature? replay? decrypt? SHA-256? right direction? payload schema (Zod)?
     any failure -> rejected log + audit entry, nothing else changes
  -> crew state (with the age of the data), alerts (new -> acknowledged -> resolved with a note),
     hash-chained audit, acknowledgement queued up
  -> resolution note goes up to the crew as advice (same security, same delays)
Station:
  -> acknowledgement releases custody; no acknowledgement in 2 x light time + 10 min -> send again
```

## Run modes
- **One page (default):** both sides in one browser tab over an in-memory link. Used by the Mission page and the tests.
- **Two windows:** a station window and a ground window over `BroadcastChannel` (same browser, zero network). Each window opens only its own database. Public keys meet in the pre-flight pairing record; private keys never leave their side.

## Assumptions (all labelled on screen)
| Assumption | Value | Why |
|---|---|---|
| Ground response time per tier | 240 / 120 / 60 / 5 min | Team setting, used for the earliest-answer estimate |
| Longest acceptable wait | tier 3: 24 h, tier 4: 30 min | Team setting |
| Mars relay passes | 02:00 and 14:00 UTC, 6 h each | Modelled on DSN practice; real future pass times are not published |
| Moon link | continuous, 28 Mbps | Real DSN Now reading used as a reference |
| Custody margin | 10 min beyond the round trip | Team setting |
| Data shown as unknown after | 36 h without health data | Team setting; old data is never shown as current |
| Radiation projection | average so far x days left | Engineering estimate, capped at "watch" |
| Daily dose within NASA's range | uniform draw inside the published low-high range | Where in the range a day falls is simulated |
| Exercise target | 90 min on 6 days a week | NASA's ISS practice, used as a mission plan, not a medical threshold |
| Adaptation phase | about 45 days | NASA podcast (Dr. Crucian), an estimate |

## Real data used (fetched once, stored unchanged, SHA-256 recorded)
- JPL Horizons: Earth-Mars and Earth-Moon distance and Sun-Observer-Target angle, daily, 2021-2040.
- NASA OSDR OSD-569: Inspiration4 complete blood counts.
- NASA-STD-3001 via OCHMO Radiation Protection brief: 600 mSv career limit, 250 mSv per solar particle event.
- NASA NTRS 20250006168: daily dose ranges for ISS, Moon and Mars, solar particle event estimates.
