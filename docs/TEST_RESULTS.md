# Test results (measured 14 November 2026)

| | Result |
|---|---|
| Automated tests | **381 / 381 pass** (34 files, `npm run check`) |
| Urgent multi-signal case, 200 random seeds | **200 / 200** caught at tier 4 |
| Healthy crew, 6 astronauts × 200 seeds | **3 / 1,200** false alerts (0.25%) |
| Engine speed (210 readings) | **0.2 ms** per assessment |
| Seal one message (hash + encrypt + sign) | **0.14 ms** |
| Ground's seven checks on one message | **0.23 ms** |
| Live website (browser tests) | judge flow 11 / 11, offline works, 0 errors |

## How we test
| Area | How | Where |
|---|---|---|
| Rules engine | 76 golden cases (every rule at its exact boundary), 1,000 random inputs, property tests (deterministic, worse reading never gives a better status) | `src/engine` |
| Simulator | 6 crew × 7 scenarios, 200 random seeds | `src/sim` |
| Link geometry | Light time = JPL Horizons distance / c; the NASA 2° rule reproduces the Nov 2023 Mars conjunction moratorium | `src/link` |
| Security | Tampering, replay, wrong sender, wrong direction, malformed data: all refused and logged | `src/link/security.test.ts`, `src/ground` |
| Whole system | Station + link + ground end to end, custody and re-send, reset races | `src/services` |
| Whole missions | 10 random seeds with invariants (nothing lost, nothing stored twice, every attack refused, audit intact) | `src/services/simulation*.test.ts` |

## Whole missions on the real system
| Mission | Check-ins | Messages | Attacks refused | Stored twice | Illnesses caught on board | Median delay | Longest wait | On-board decisions | Audit |
|---|---|---|---|---|---|---|---|---|---|
| Mars, Nov 2023 conjunction, 26 days (× 5 seeds) | 156 | 1,122 | 8–10 of 8–10 | 0 | 6 / 6 | 42 h | 360 h (15 dark days) | 5 | intact |
| Moon, 14 days | 84 | 662 | 4 of 4 | 0 | 6 / 6 | < 1 min | 24 h | 0 | intact |
| ISS, 14 days | 84 | 662 | 4 of 4 | 0 | 6 / 6 | < 1 min | 24 h | 0 | intact |

In every run, 7 messages created in the last hours were still waiting for the next contact window when the run stopped.

## Mission dataset check
6 crew × 118 flight days, 10,620 readings, 6 planned health events: **6 / 6 detected**; 2 low-level "watch" days in 690 healthy days (0.3%), never an alert to Earth. See `public/media/dataset/`.

## Run them yourself
```bash
npm install
npm run check
```
Or open https://asteron-mission.vercel.app/verify and run the 76 golden cases in the browser.
