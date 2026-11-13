import { create } from 'zustand'

interface AppState {
  crewId: string
  setCrew: (id: string) => void
  now: string
  tick: () => void
  /** Moves the clock forward only (never back), so freshly written readings are never 'in the future'. */
  setNow: (iso: string) => void
}

export const useApp = create<AppState>((set) => ({
  crewId: 'rahal',
  setCrew: (crewId) => set({ crewId }),
  now: new Date().toISOString(),
  tick: () => set((s) => ({ now: maxIso(s.now, new Date().toISOString()) })),
  setNow: (iso) => set((s) => ({ now: maxIso(s.now, iso) })),
}))

const maxIso = (a: string, b: string) => (a > b ? a : b)
