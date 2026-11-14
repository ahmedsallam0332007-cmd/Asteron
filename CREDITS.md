# Credits and licences

## Data
| What | Source | Licence / terms | Where |
|---|---|---|---|
| Earth–Mars and Earth–Moon ephemeris, 2021–2040 | NASA JPL Horizons API | NASA public data | `src/content/nasa/ephemeris.json` (fetched by `tools/fetch_horizons.py`, unchanged, SHA-256 recorded) |
| Inspiration4 complete blood counts | NASA OSDR, OSD-569 | NASA open science data | `data/nasa/` (original CSV), `src/content/nasa/osd569-cbc.json` (`tools/import_osd569.py`) |
| Radiation limits | NASA-STD-3001 Vol. 1 Rev. C; NASA OCHMO Radiation Protection brief | NASA public documents | `src/content/radiation.json` |
| Daily dose ranges | NASA NTRS 20250006168 | NASA public document | `src/content/radiation.json` |
| Hazards and risks | NASA Human Research Program | NASA public pages | `src/content/hazards.json`, `rules.json` |
| Wearable reference | Canadian Space Agency, Bio-Monitor | CSA public page | `src/content/sources.json` |
| Every medical threshold | listed per rule with its source | — | `src/content/sources.json`, Data & Sources page |

## Images and 3D
| What | Credit | Licence |
|---|---|---|
| “Cosmic Cliffs”, Carina Nebula (background, colour-graded) | NASA, ESA, CSA, STScI (James Webb Space Telescope) | Public, credit required |
| “Male Body” 3D model (`public/media/body.glb`, converted from FBX) | Alexander Antipov, https://sketchfab.com/3d-models/male-body-15a422001834483c9750ce6117d59cc1 | CC BY 4.0 |

No NASA logos are used. Asteron is not affiliated with or endorsed by NASA.

## Software
React, React Router, Vite, Tailwind CSS, Zustand, Dexie, Zod, three.js, React Three Fiber, drei, Recharts, Lucide icons, Vitest, Playwright, vite-plugin-pwa, fake-indexeddb, oxlint (MIT / ISC / Apache-2.0). Fonts: Sora, Inter, JetBrains Mono (SIL Open Font License, via Fontsource).
