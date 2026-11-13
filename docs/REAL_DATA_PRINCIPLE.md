# Asteron real-data principle (agreed 13 Nov 2026)

> The simulation is built on NASA's real data. We do not calculate orbits ourselves; we take what NASA has already calculated.

Everything in Asteron that models space, the link or health follows this rule.

## Real sources (use these, in this order)
| Source | What it gives | Used for |
|---|---|---|
| NASA JPL Horizons API (`ssd.jpl.nasa.gov/api/horizons.api`) | Daily Earth-Mars and Earth-Moon distance (`delta`, AU) and Sun-Observer-Target angle (`S-O-T`) | Real one-way light time for any date; solar-conjunction blackout days |
| NASA DSN Now (`eyes.nasa.gov/dsn/data/dsn.xml`) | Which DSN dish talks to which spacecraft, band and data rate, live | Real data rates (e.g. JWST K-band 28 Mbps, Juno X-band 18 kbps); live snapshot for judges |
| NASA documents already cited | Mars relay UHF up to 2 Mbps; rover direct-to-Earth 160-500 bit/s; ISS Ku 600 Mbps; TDRS >99% coverage | Capacity of each contact window |
| NASA OSDR OSD-569 | Inspiration4 blood counts | Real crew health reference data |

## How they are used in software
1. A tool script fetches the data once (`tools/fetch_*.py`), stores it unchanged under `src/content/nasa/` with the query URL, fetch date and SHA-256. The app then runs offline.
2. Pure functions turn it into decisions (`src/link/contactPlan.ts`): light time = distance / c, blackout when S-O-T is below a threshold, next contact window, window capacity, earliest possible reply.
3. Tests check the math against the source (distance / c) and the blackout dates against NASA's published conjunction dates.

## What is NOT real data (label it on screen)
- Exact future DSN pass times (NASA does not publish them in advance): engineering assumption, shown as such.
- Crew vitals: simulated, anchored to published findings (Norsk 2015, Barger 2014).
- Any threshold or parameter we choose ourselves: "engineering assumption" or "Team Asteron design".

Never present a simulated or assumed value as measured. Never invent a number that a NASA source can give.
