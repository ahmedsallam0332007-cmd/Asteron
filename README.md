# Asteron

**Astronaut health, even when Earth can't answer.**
NASA Space Apps Challenge 2026, Cairo. Team Asteron.
Challenge: *Create Health Monitoring Software for Astronauts on Space Missions*.

| | |
|---|---|
| Live app (no login, works offline after the first visit) | https://asteron-mission.vercel.app |
| 30-second demo video | https://asteron-mission.vercel.app/media/asteron-demo-30s.mp4 (also in this repo: `public/media/asteron-demo-30s.mp4`) |
| System cycle and measured test results (PDF) | https://asteron-mission.vercel.app/media/asteron-system-cycle.pdf |
| Mission dataset (6 crew, 118 days) | [`public/media/dataset/`](public/media/dataset/) |

## What it is
Asteron is an offline-first health monitoring system for astronauts on long missions, with two sides joined by a simulated delay-tolerant link:

- **Station app (astronaut):** a daily check-in (vital signs, sleep, mood, stress, workload, symptoms). An on-board engine compares each value with the astronaut's own baseline and with published thresholds and gives a tier from 1 (normal) to 4 (urgent). It then checks whether Earth can answer in time, using real NASA distances and contact windows. If not, the crew is told to follow the on-board protocol now. A 3D body shows where the problem is.
- **Ground console (flight surgeon):** crew roster with the age of the data, alert inbox (acknowledge, resolve with a note that goes back to the crew), radiation dose against NASA's career limit, heat map, shift handover, hash-chained audit log, refused messages.
- **Mission Link:** real light time and conjunction blackouts from NASA JPL Horizons; reports are encrypted (AES-GCM-256), signed (ECDSA P-256), queued, and sent only in contact windows, highest priority first, with custody acknowledgements and re-sending.
- **Mission Simulator:** runs a whole mission on the real system (six crew, illnesses, an attacker, a solar storm, an automatic flight surgeon) and lets you explore who did what, day by day.

## How each astronaut is read
Not the spacesuit: inside the station astronauts wear normal clothes. Asteron reads each person from three sources:
1. **Smart shirt (wearable)**, worn at work, in sleep and during exercise. Reference: the CSA Bio-Monitor used on the ISS, which measures heart activity, blood pressure, breathing, skin temperature, blood oxygen and activity. Gives resting heart rate, blood pressure, SpO2, temperature, sleep hours, exercise minutes.
2. **One-minute daily check-in** on the station tablet: mood, stress, workload, headache, rash, dizziness, vision change.
3. **Personal dosimeter**: daily radiation dose, tracked against NASA's 600 mSv career limit.

In this prototype the shirt and the dosimeter are simulated with the same data format, and every value is badged SIM; typed values are MANUAL or JUDGE. Connecting real hardware replaces only the input step.

## Try it (5 minutes)
Open the live app and follow **"Judges: start here"** on the home page:
1. **Station** → Start daily check-in → Save and analyse. Pick the scenario "Urgent multi-signal case" in the top bar for a tier-4 example.
2. **Ground** → the same astronaut arrives with the age of the data. Acknowledge, write a note, Resolve.
3. **Mission Link** → "Attacker: alter the next bundle", then do another check-in: the ground refuses it. "Demo: Mars conjunction, Nov 2023": the link goes dark for two weeks.
4. **Simulator** → Run the mission (about 20 s), click any square of the timeline.
5. **Judge Lab** → type your own values (sample input: heart rate 125, SpO2 90, temperature 38.6) and watch the engine and the body update.
6. **Verify** → run the 76 golden test cases in your browser.

## Run it yourself
Requires Node.js 20 or newer (LTS).
```bash
npm install
npm run dev        # open the printed link, usually http://localhost:5173
npm run check      # type check + lint + 381 tests
npm run build      # production build in dist/
```
No accounts, keys or internet connection are needed at runtime. Python 3 is only needed to re-run the data import scripts in `tools/`.

## NASA data used (stored unchanged, SHA-256 recorded)
- **NASA JPL Horizons API:** daily Earth-Mars and Earth-Moon distance and Sun-Earth-target angle, 2021-2040 → light time and conjunction blackouts (`src/content/nasa/ephemeris.json`, `tools/fetch_horizons.py`).
- **NASA OSDR OSD-569 (Inspiration4):** complete blood counts, shown unchanged on the NASA Data page (`src/content/nasa/osd569-cbc.json`, `tools/import_osd569.py`).
- **NASA-STD-3001 / OCHMO Radiation Protection brief:** 600 mSv career and 250 mSv per solar event limits.
- **NASA NTRS 20250006168:** daily dose ranges for ISS, Moon and Mars.
- **NASA HRP hazards and risks**, **NASA podcast Hazard 5**, **NASA NTRS DTN on the ISS**, Webb "Cosmic Cliffs" image (background).

Every rule threshold cites its source in `src/content/sources.json`; all sources are listed in the app on the Data & Sources page.

## Repository layout
```
data/nasa     original NASA files, unchanged
docs          architecture, testing, real-data principle
tools         Python scripts that fetched the NASA data once
public/media  background image, 3D body model, demo video, cycle PDF, mission dataset
src/content   indicators, rules, sources, radiation, real NASA data (validated with Zod)
src/engine    pure health engine (rules, baseline, trends, radiation, adaptation)
src/link      contact plan, channel, protocol, security, pairing
src/station   station node      src/ground  ground node, alerts, handover
src/services  mission runtime, transports, clock, simulator
src/ui        website (React, three.js)
```
More: [`docs/SYSTEM.md`](docs/SYSTEM.md) (architecture), [`SECURITY.md`](SECURITY.md), [`docs/TESTING.md`](docs/TESTING.md), [`docs/REAL_DATA_PRINCIPLE.md`](docs/REAL_DATA_PRINCIPLE.md), [`CREDITS.md`](CREDITS.md).

## Limits
- Crew data is **simulated** (badged SIM), anchored to published findings; space geometry and radiation limits are real.
- Rules are cited but **not clinically reviewed**. Self-support aid, not a medical diagnosis.
- Link security follows BPSec ideas but is not certified. Future Mars relay pass times are an assumption, labelled in the app.

## Credits and licences
Libraries: React, Vite, Tailwind CSS, Zustand, Dexie, Zod, three.js, React Three Fiber, drei, Recharts, Lucide, Vitest, Playwright, vite-plugin-pwa (MIT/ISC). Fonts: Sora, Inter, JetBrains Mono (SIL OFL, via Fontsource). Image: "Cosmic Cliffs" (NASA, ESA, CSA, STScI). 3D body model: "Male Body" by Alexander Antipov, https://sketchfab.com/3d-models/male-body-15a422001834483c9750ce6117d59cc1 (CC BY 4.0), converted to glTF. No NASA logos are used. Asteron is not affiliated with or endorsed by NASA.

*Self-support aid, not a medical diagnosis. Station and Ground crew data is simulated; the NASA Data page shows real published data.*
