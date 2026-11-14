# How to run and test Asteron

## Run
```
npm install
npm run dev        # open the printed link (usually http://localhost:5173)
```

## Automated tests (about 1 minute)
```
npm run check      # typecheck + lint + 380 tests (about 30 s)
npm run build      # production build + offline service worker
```
What the 380 tests cover (architecture: docs/SYSTEM.md):
| Area | File | What is proved |
|---|---|---|
| Rules engine | `src/engine/__vectors__/*.json` + `__tests__` | 61 golden cases, every rule at its exact boundary, 1,000 random inputs (deterministic, order-independent, no future data, worse reading never gives a better status) |
| Simulation | `src/sim/*.test.ts` | 6 crew x 7 scenarios; 200 random seeds: healthy false-alert rate < 0.5%, every scenario detected every time |
| Real NASA data | `src/nasa/cbc.test.ts` | OSD-569 imported unchanged (SHA-256), 8 real out-of-range values, 8 values from a shifted row excluded |
| Link (real ephemeris) | `src/link/link.test.ts` | JPL Horizons light time, NASA 2-degree conjunction rule reproduces the Nov 2023 moratorium exactly, windows, capacity, earliest reply, link-aware escalation |
| Protocol | `src/link/protocol.test.ts` | priority order, capacity, resume across windows, SHA-256, duplicates, custody |
| Security | `src/link/security.test.ts`, `keys.test.ts`, `pairing.test.ts` | see SECURITY.md |
| Content (health analysis) | `src/content/stage1.test.ts`, `hazards.test.ts` | stress, workload and 4 symptoms; radiation limits checked against NASA's original documents; 17-risk coverage |
| New engines | `radiation`, `countermeasures`, `replay` tests | 600 mSv / 250 mSv limits, projection capped at watch; exercise plan; adaptation phase; day-by-day replay never sees the future |
| Link channel | `src/link/channel.test.ts` | contact windows, conjunction, 500 bit/s partial sends, urgent overtakes a large bundle |
| Station node | `src/station/node.test.ts` | check-in -> decision -> sealed outbox; custody; advice; storm warning; tamper, replay, wrong direction, bad payload, garbage all refused |
| Ground node | `src/ground/*.test.ts` | verify -> crew state -> alerts (dedupe, lifecycle) -> audit -> advice up; freshness; handover; heatmap |
| Full mission loop | `src/services/fullLoop.test.ts` | Mars conjunction from start to finish, attacker in the middle, solar storm, cut/restore, handover, two windows over BroadcastChannel |
| Store | `src/store/system.test.ts` | what the pages use: start, tick, compression, cut, profile, tamper events |
| Mission Simulator | `src/services/simulation*.test.ts` | a full 26-day Mars mission through the Nov 2023 conjunction, plus 9 more seeds: no message lost or stored twice, every attack refused, nothing sent during a blackout, audit chain intact, surgeon answers, storm warning arrives one light-time later |

## Try it by hand: the judge path (5 minutes)
1. **Home**: the 3D Earth and the relay satellite; scroll for how it works.
2. **Station** → **Start daily check-in** → **Save and analyse**: the steps, the tier, and the link decision ("Earth can answer in time" or "On-board protocol now").
3. **Ground**: the same astronaut appears with the age of the data; **Acknowledge** → write a note → **Resolve and send advice**; **Verify chain**; **Build handover report**.
4. **Station** again: the advice is under "Messages from Earth".
5. **Mission Link**: **Attacker: alter the next bundle**, then do a check-in: the arrival list shows it refused. **Demo: Mars conjunction, Nov 2023**: the link goes dark for two weeks.
6. **Simulator**: **Run the mission** (26 days, about 20 s). Click any square of the timeline, filter "who did what", and **Follow a message** from creation to arrival.
7. **Judge Lab**: type your own values or pick a preset; the body and the decision update live.
8. **Verify**: run the 76 golden tests in the browser.

## Older manual steps (5 minutes)
1. **Station**: all six crew show "Check-in pending". Nothing is assessed before a check-in.
2. Top right, **Scenario: Urgent multi-signal case**. Still pending.
3. **Start daily check-in** for Cmdr. Rahal: fields are pre-filled with today's simulated sensor values (SIM). Change one value: it becomes MANUAL. **Save and analyse**: the steps appear, then Urgent / Tier 4.
4. Open **Lungs & oxygen**: the rule, the readings, the source and the published spaceflight finding.
5. **Report for flight surgeon**: copy or print.
6. **NASA Data**: real Inspiration4 blood counts, the 8 real findings and the data-quality check.
7. **Hazards**: NASA's 5 hazards and 17 risks, and what Asteron covers.

The whole system (link, ground, security, radiation, replay) is built and tested headless. The new screens are the next step; the engines behind them are proved by the tests above.
