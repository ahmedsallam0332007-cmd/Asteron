# How to run and test Asteron

## Run
```
npm install
npm run dev        # open the printed link (usually http://localhost:5173)
```

## Automated tests (about 1 minute)
```
npm run check      # typecheck + lint + 196 unit tests
npm run build      # production build + offline service worker
```
What the 196 tests cover:
| Area | File | What is proved |
|---|---|---|
| Rules engine | `src/engine/__vectors__/*.json` + `__tests__` | 61 golden cases, every rule at its exact boundary, 1,000 random inputs (deterministic, order-independent, no future data, worse reading never gives a better status) |
| Simulation | `src/sim/*.test.ts` | 6 crew x 7 scenarios; 200 random seeds: healthy false-alert rate < 0.5%, every scenario detected every time |
| Real NASA data | `src/nasa/cbc.test.ts` | OSD-569 imported unchanged (SHA-256), 8 real out-of-range values, 8 values from a shifted row excluded |
| Link (real ephemeris) | `src/link/link.test.ts` | JPL Horizons light time, NASA 2-degree conjunction rule reproduces the Nov 2023 moratorium exactly, windows, capacity, earliest reply, link-aware escalation |
| Protocol | `src/link/protocol.test.ts` | priority order, capacity, resume across windows, SHA-256, duplicates, custody |
| Security | `src/link/security.test.ts` | see SECURITY.md |

## Try it by hand (5 minutes)
1. **Station**: all six crew show "Check-in pending". Nothing is assessed before a check-in.
2. Top right, **Scenario: Urgent multi-signal case**. Still pending.
3. **Start daily check-in** for Cmdr. Rahal: fields are pre-filled with today's simulated sensor values (SIM). Change one value: it becomes MANUAL. **Save and analyse**: the steps appear, then Urgent / Tier 4.
4. Open **Lungs & oxygen**: the rule, the readings, the source and the published spaceflight finding.
5. **Report for flight surgeon**: copy or print.
6. **NASA Data**: real Inspiration4 blood counts, the 8 real findings and the data-quality check.
7. **Hazards**: NASA's 5 hazards and 17 risks, and what Asteron covers.

Link and Ground screens are being built next; their engines are already tested (see above).
