import { Card } from '../components/Status'

export function About() {
  return (
    <div className="grid gap-6 max-w-4xl">
      <div>
        <p className="eyebrow">About</p>
        <h1 className="font-display text-3xl font-bold mt-1">Team Asteron · NASA Space Apps Challenge 2026, Cairo</h1>
        <p className="text-dust mt-2">Challenge: Create Health Monitoring Software for Astronauts on Space Missions.</p>
      </div>
      <Card>
        <h2 className="font-display text-lg font-bold">What Asteron is</h2>
        <p className="mt-2 text-dust">An offline-first health monitoring system for astronauts with two connected sides: a Station app for the crew and a Ground console for the flight surgeon. A transparent rules engine compares each astronaut with their own normal and with published thresholds, and decides on board when Earth cannot answer in time. Every report crosses a sealed, delay-tolerant link that follows NASA’s real geometry. The same idea works on Earth for remote clinics, ships and isolated sites where the network comes and goes.</p>
      </Card>
      <Card>
        <h2 className="font-display text-lg font-bold">Honest limits</h2>
        <ul className="mt-2 grid gap-1.5 text-sm text-dust list-disc pl-5">
          <li>Self-support aid, not a medical diagnosis. Rules have not been reviewed by a clinician; each one is marked “unchecked” until the team verifies it against its source.</li>
          <li>Crew data is simulated and badged SIM. Real NASA data is used where it is public (JPL Horizons, OSDR OSD-569, NASA-STD-3001, NASA NTRS).</li>
          <li>Security follows the ideas of BPSec (RFC 9172/9173) and CCSDS SDLS but is not wire-compatible with them and has not been audited.</li>
          <li>Mars relay pass times, ground response times and the custody margin are team assumptions, labelled where they are used.</li>
        </ul>
      </Card>
      <Card>
        <h2 className="font-display text-lg font-bold">Credits and disclosure</h2>
        <ul className="mt-2 grid gap-1.5 text-sm text-dust list-disc pl-5">
          <li>Background: “Cosmic Cliffs”, Carina Nebula, James Webb Space Telescope (NASA, ESA, CSA, STScI), colour-graded to the Asteron palette.</li>
          <li>3D body model: “Male Body” by Alexander Antipov (Sketchfab, CC BY 4.0), converted to glTF, rendered as a hologram. <a className="underline" href="https://sketchfab.com/3d-models/male-body-15a422001834483c9750ce6117d59cc1" target="_blank" rel="noreferrer">Source</a>.</li>
          <li>NASA does not endorse this project. No NASA logos are used.</li>
          <li>Open-source libraries: React, Three.js, React Three Fiber, Dexie, Zod, Recharts, Vite.</li>
        </ul>
      </Card>
    </div>
  )
}
