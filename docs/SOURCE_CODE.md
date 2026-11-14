# Source code: what each part does and where it goes

One check-in travels through the code in this order:

```
Station UI ─► station node ─► engine ─► link decision ─► seal ─► outbox ─► link runtime ─► ground node ─► ground UI
 src/ui        src/station     src/engine  src/link        src/link  src/data   src/services     src/ground      src/ui
```

| Folder | What it does | Goes to |
|---|---|---|
| `src/content` | The knowledge: 14 indicators, rules with their sources, radiation limits, crew profiles, scenarios, and the real NASA data (JPL Horizons ephemeris, OSD-569). Validated with Zod when loaded. | Read by the engine, the link and the UI |
| `src/sim` | Simulated sensors: each astronaut's own normal, day-to-day variation, planned illnesses, dosimeter. Deterministic (same seed, same numbers). Every value is badged SIM. | Feeds check-ins to the station node |
| `src/engine` | The health engine (pure functions): absolute limits, personal baseline (median and MAD over 14 days), 3-day trends, combined rules → 6 body systems → tier 1–4. Also radiation, exercise and adaptation phase. | Returns the assessment to the station node |
| `src/link` | Contact plan from JPL Horizons (light time, windows, conjunction), earliest reply and link-aware escalation, message format and priority, AES-GCM-256 + ECDSA P-256 sealing, key pairing. | Used by the station node (sealing) and the ground node (opening) |
| `src/data` | Two separate IndexedDB databases: the station's and the ground's. They never read each other. | Storage for each side |
| `src/station` | Station node: saves the check-in, runs the engine, decides follow-tier or on-board protocol, seals and queues messages, handles acknowledgements and re-sends. | Puts sealed messages in the station outbox |
| `src/services` | The running system: mission clock, the link runtime (sends only in contact windows, urgent first, arrival after light time), transports, attacker hook, and the whole-mission simulator. | Moves messages between the two sides |
| `src/ground` | Ground node: seven checks on every message, crew state with data age, alert lifecycle (new → acknowledged → resolved with a note), hash-chained audit, shift handover. | Shown on the ground console; advice goes back up the link |
| `src/store` | Owns the running system for the website and ticks the clock. | Used by every page |
| `src/ui` | The website: Home, Station, Mission Link, Ground, Judge Lab, Simulator, Data & Sources, Verify, About; 3D body (`src/ui/body`). | What judges see |
| `tools` | Python scripts that fetched the NASA data once (JPL Horizons, OSDR OSD-569). | Write `src/content/nasa` |
| `data/nasa` | Original NASA files, unchanged. | Imported by `tools` |
| `public/media` | Background image, 3D body model, demo video, system cycle PDF, mission dataset. | Served by the website |
| `docs` | Architecture (`SYSTEM.md`), test results, real-data principle, this file. | Reading |

Architecture in more detail: [`SYSTEM.md`](SYSTEM.md). Security: [`../SECURITY.md`](../SECURITY.md).
