import type { BodyCard } from './Body3D'

/** The key readings shown beside each body system, from the latest value of each indicator. */
export function cardsFrom(latest: Record<string, number | undefined>): BodyCard[] {
  const v = (id: string, d = 0) => { const x = latest[id]; return x === undefined ? '—' : x.toFixed(d) }
  const sym = (id: string, label: string) => (latest[id] === 1 ? [label] : [])
  return [
    { system: 'brain', lines: [`Sleep ${v('sleep_h', 1)} h · Mood ${v('mood')}/5`, `Stress ${v('stress')}/5 · Load ${v('workload')}/5`, ...sym('sym_headache', 'Headache reported'), ...sym('sym_vision', 'Vision change')] },
    { system: 'resp', lines: [`SpO₂ ${v('spo2')} %`] },
    { system: 'msk', lines: [`Exercise ${v('exercise_min')} min`] },
    { system: 'cardio', lines: [`Heart rate ${v('hr_rest')} bpm`, `BP ${v('bp_sys')} / ${v('bp_dia')}`] },
    { system: 'metabolic', lines: [`Sleep ${v('sleep_h', 1)} h · ${v('exercise_min')} min active`] },
    { system: 'immune', lines: [`Temp ${v('temp', 1)} °C`, ...sym('sym_rash', 'Rash or cold sore')] },
  ]
}

export function latestOf(readings: { indicatorId: string; value: number; takenAt?: string }[]): Record<string, number> {
  const out: Record<string, { v: number; t: string }> = {}
  for (const r of readings) { const t = r.takenAt ?? ''; if (!out[r.indicatorId] || out[r.indicatorId].t <= t) out[r.indicatorId] = { v: r.value, t } }
  return Object.fromEntries(Object.entries(out).map(([k, x]) => [k, x.v]))
}
