import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { GroundDB, StationDB } from '../data/db'
import type { PreflightDB } from '../link/pairing'
import type { ProfileId } from '../link/profiles'
import type { Delivered } from '../services/mission'
import { AsteronSystem, type Role } from '../services/system'
import type { Transport } from '../services/transport'

export type LinkEvent = Delivered & { dir: 'down' | 'up' }
const MAX_EVENTS = 200

export interface SystemState {
  status: 'idle' | 'booting' | 'pairing' | 'ready' | 'error'
  error?: string
  system?: AsteronSystem
  profile: ProfileId
  cut: boolean
  compression: number
  missionNow: number
  /** Increments after every tick, so views know to re-read the databases. */
  version: number
  events: LinkEvent[]
  start(o: { epoch: number; profile: ProfileId; scenarioId: string; reset?: boolean }): Promise<void>
  tick(): Promise<void>
  fastForward(ms: number): Promise<void>
  reset(o: { epoch: number; profile: ProfileId; scenarioId: string }): Promise<void>
  setCut(v: boolean): void
  setProfile(p: ProfileId): void
  setCompression(c: number): void
  tamperNext(dir: 'down' | 'up'): void
  pushEvents(e: LinkEvent[]): void
  stop(): void
}

export interface StoreOptions {
  role?: Role
  stationDb?: StationDB
  groundDb?: GroundDB
  preflight?: PreflightDB
  transport?: Transport
  /** Wall clock; injectable for tests. */
  clock?: () => number
  /** Tick every second in the browser. */
  autoTick?: boolean
}

export function createSystemStore(opts: StoreOptions = {}) {
  const now = opts.clock ?? (() => Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  let busy = false

  const store = createStore<SystemState>()((set, get) => {
    const after = (out: { down: Delivered[]; up: Delivered[] }) => {
      const sys = get().system!
      get().pushEvents([...out.down.map((d) => ({ ...d, dir: 'down' as const })), ...out.up.map((d) => ({ ...d, dir: 'up' as const }))])
      set((s) => ({ missionNow: sys.missionNow(), version: s.version + 1 }))
    }
    return {
      status: 'idle', profile: 'iss', cut: false, compression: 1, missionNow: 0, version: 0, events: [],

      async start(o) {
        try {
          set({ status: 'booting' })
          const system = await AsteronSystem.boot({ role: opts.role, stationDb: opts.stationDb, groundDb: opts.groundDb, preflight: opts.preflight, transport: opts.transport, profile: o.profile, epoch: o.epoch, realNow: now() })
          set({ status: 'pairing', system })
          await system.ready()
          if (o.reset !== false) await system.reset({ epoch: o.epoch, scenarioId: o.scenarioId, profile: o.profile, realNow: now() })
          set({ status: 'ready', profile: o.profile, missionNow: system.missionNow(now()), cut: system.isCut(), compression: system.compression(), events: [] })
          if (opts.autoTick) timer = setInterval(() => void get().tick(), 1000)
        } catch (e) {
          set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
        }
      },

      async tick() {
        const sys = get().system
        if (!sys || get().status !== 'ready' || busy) return
        busy = true
        try { after(await sys.tick(now())) } finally { busy = false }
      },

      async fastForward(ms) {
        const sys = get().system
        if (!sys) return
        busy = true
        try { after(await sys.advanceMission(ms)) } finally { busy = false }
      },

      async reset(o) {
        const sys = get().system
        if (!sys) return
        await sys.reset({ ...o, realNow: now() })
        set((s) => ({ profile: o.profile, missionNow: sys.missionNow(now()), events: [], version: s.version + 1 }))
      },

      setCut(v) { get().system?.setCut(v); set({ cut: v }) },
      setProfile(p) { get().system?.setProfile(p); set({ profile: p }) },
      setCompression(c) {
        const sys = get().system
        if (!sys) return
        sys.setCompression(c, now())
        set({ compression: c })
      },
      tamperNext(dir) { get().system?.transport.tamperNext(dir, 1) },
      pushEvents(e) { if (e.length) set((s) => ({ events: [...s.events, ...e].slice(-MAX_EVENTS) })) },
      stop() { if (timer) clearInterval(timer); timer = undefined; get().system?.close() },
    }
  })
  return store
}

/** The one store the website uses: both sides in this page, ticking every second. */
export const systemStore = createSystemStore({ autoTick: true })
export const useSystem = <T,>(sel: (s: SystemState) => T) => useStore(systemStore, sel)
