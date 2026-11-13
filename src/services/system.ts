import { content } from '../content'
import { GroundDB, StationDB } from '../data/db'
import { seedScenario } from '../data/seed'
import { verifyAuditChain } from '../data/groundRepo'
import { buildHandover } from '../ground/handover'
import { GroundNode } from '../ground/node'
import type { LinkKeys } from '../link/keys'
import { ensureKeys, PreflightDB } from '../link/pairing'
import type { ProfileId } from '../link/profiles'
import { CREW } from '../sim'
import { generateDose, type DoseProfile } from '../sim/dose'
import { StationNode } from '../station/node'
import { clockAt, rebase, type ClockState } from './clock'
import { Mission } from './mission'
import { LoopbackTransport, type Transport } from './transport'

export type Role = 'both' | 'station' | 'ground'
const DAY = 86_400_000
const KEEP = new Set(['link.identity', 'link.seq'])
export const doseProfileOf = (p: ProfileId): DoseProfile => (p === 'iss' ? 'iss' : p === 'moon' ? 'moon' : 'mars')

export interface BootOptions {
  role?: Role
  stationDb?: StationDB
  groundDb?: GroundDB
  preflight?: PreflightDB
  transport?: Transport
  profile: ProfileId
  /** Mission time at boot. */
  epoch: number
  /** Real (wall-clock) time at boot. */
  realNow: number
  compression?: number
}

/**
 * The whole Asteron system behind one object: databases, keys, both nodes, the link and the mission clock.
 * One page can run both sides (role 'both'), or a station window and a ground window can each run one side
 * over BroadcastChannel. The website only talks to this object.
 */
export class AsteronSystem {
  readonly role: Role
  readonly transport: Transport
  private readonly sDb?: StationDB
  private readonly gDb?: GroundDB
  private readonly preflight: PreflightDB
  private stationNode?: StationNode
  private groundNode?: GroundNode
  private profileId: ProfileId
  private clock: ClockState
  private lastReal: number
  mission!: Mission

  private constructor(o: BootOptions) {
    this.role = o.role ?? 'both'
    this.sDb = this.role === 'ground' ? undefined : (o.stationDb ?? new StationDB())
    this.gDb = this.role === 'station' ? undefined : (o.groundDb ?? new GroundDB())
    this.preflight = o.preflight ?? new PreflightDB()
    this.transport = o.transport ?? new LoopbackTransport()
    this.profileId = o.profile
    this.clock = { missionAt: o.epoch, realAt: o.realNow, compression: o.compression ?? 1 }
    this.lastReal = o.realNow
  }

  static async boot(o: BootOptions): Promise<AsteronSystem> {
    const sys = new AsteronSystem(o)
    await sys.tryPair()
    return sys
  }

  /** Pairs with the other side's published public key. Returns false while the peer has not published yet. */
  private async tryPair(): Promise<boolean> {
    let sk: LinkKeys | null = null, gk: LinkKeys | null = null
    if (this.sDb) sk = await ensureKeys('station', this.sDb, this.preflight)
    if (this.gDb) gk = await ensureKeys('ground', this.gDb, this.preflight)
    if (this.sDb && !sk) sk = await ensureKeys('station', this.sDb, this.preflight) // both sides in one page: the ground has now published
    if ((this.sDb && !sk) || (this.gDb && !gk)) return false
    const profile = () => this.profileId
    this.stationNode = sk ? new StationNode({ db: this.sDb!, keys: sk, content, profile }) : undefined
    this.groundNode = gk ? new GroundNode({ db: this.gDb!, keys: gk, content }) : undefined
    this.mission = new Mission({ station: this.stationNode, ground: this.groundNode, transport: this.transport, profile, start: this.missionNow() })
    await this.mission.init()
    return true
  }

  /** Waits until the other window has published its public key (pre-flight pairing). */
  async ready(timeoutMs = 10_000) {
    const end = Date.now() + timeoutMs
    while (!this.mission) {
      if (await this.tryPair()) return
      if (Date.now() > end) throw new Error('Pairing timed out: open the other window (station or ground) once')
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  get station(): StationNode {
    if (!this.stationNode) throw new Error(this.role === 'ground' ? 'The station node is not available in the ground window' : 'Not paired yet')
    return this.stationNode
  }
  get ground(): GroundNode {
    if (!this.groundNode) throw new Error(this.role === 'station' ? 'The ground node is not available in the station window' : 'Not paired yet')
    return this.groundNode
  }
  get stationDb(): StationDB { if (!this.sDb) throw new Error('No station database in the ground window'); return this.sDb }
  get groundDb(): GroundDB { if (!this.gDb) throw new Error('No ground database in the station window'); return this.gDb }

  profile() { return this.profileId }
  setProfile(p: ProfileId) { this.profileId = p }
  setCut(v: boolean) { this.mission.setCut(v) }
  isCut() { return this.mission.isCut() }
  compression() { return this.clock.compression }

  missionNow(realNow = this.lastReal) { return clockAt(this.clock, realNow) }
  setCompression(c: number, realNow: number) { this.clock = rebase(this.clock, realNow, { compression: c }); this.lastReal = realNow }
  jumpTo(missionMs: number, realNow: number) { this.clock = rebase(this.clock, realNow, { jumpTo: missionMs }); this.lastReal = realNow }

  /** Called by the page loop with the wall clock. */
  async tick(realNow: number) {
    this.lastReal = Math.max(this.lastReal, realNow)
    return this.mission.tick(this.missionNow())
  }

  /** Moves mission time forward by `ms` (fast-forward) and runs the link up to then. */
  async advanceMission(ms: number) {
    this.jumpTo(this.missionNow() + ms, this.lastReal)
    return this.mission.tick(this.missionNow())
  }

  /**
   * Starts a fresh mission at `epoch` (any date in 2021-2040): clears this side's data (keys kept),
   * seeds the scenario and the simulated dosimetry, and queues yesterday's state and today's dose
   * so the ground learns the crew as the link allows.
   */
  async reset(o: { epoch: number; scenarioId: string; profile: ProfileId; realNow: number }) {
    this.profileId = o.profile
    this.clock = { missionAt: o.epoch, realAt: o.realNow, compression: this.clock.compression }
    this.lastReal = o.realNow
    if (this.sDb) {
      const db = this.sDb
      await db.transaction('rw', [db.doses, db.journal, db.escalations, db.outbox, db.inbox, db.settings], async () => {
        await Promise.all([db.doses.clear(), db.journal.clear(), db.escalations.clear(), db.outbox.clear(), db.inbox.clear()])
        await db.settings.where('key').noneOf([...KEEP]).delete()
      })
      await seedScenario(db, o.scenarioId, new Date(o.epoch).toISOString())
    }
    if (this.gDb) {
      const db = this.gDb
      await db.transaction('rw', [db.inbox, db.crewState, db.alerts, db.audit, db.reports, db.outbox, db.rejected, db.settings], async () => {
        await Promise.all([db.inbox.clear(), db.crewState.clear(), db.alerts.clear(), db.audit.clear(), db.reports.clear(), db.outbox.clear(), db.rejected.clear()])
        await db.settings.where('key').noneOf([...KEEP]).delete()
      })
    }
    for (const dir of ['down', 'up'] as const) this.transport.due(dir, Number.MAX_SAFE_INTEGER) // nothing from the old mission is still travelling
    this.mission = new Mission({ station: this.stationNode, ground: this.groundNode, transport: this.transport, profile: () => this.profileId, start: o.epoch })
    await this.mission.init()
    if (this.stationNode) {
      const yesterday = o.epoch - DAY
      for (const c of CREW) {
        await this.stationNode.recordDoses(generateDose(c, doseProfileOf(o.profile), new Date(yesterday).toISOString(), c.bio.flightDay - 1))
        await this.stationNode.sendSnapshot(c.id, yesterday, o.epoch)
        await this.stationNode.sendDoseSummary(c.id, o.epoch)
      }
    }
  }

  /** K4: builds the handover from the live ground state and stores it. */
  async handover() {
    const now = this.missionNow()
    const g = this.ground
    const h = buildHandover({
      now, crew: await g.crewOverview(now), alerts: await this.groundDb.alerts.toArray(), rejected: await this.groundDb.rejected.count(),
      auditOk: (await verifyAuditChain(this.groundDb)).ok, profile: this.profileId,
    })
    await this.groundDb.reports.add({ at: now, title: 'Daily handover', body: h.text })
    return h
  }

  close() { this.transport.close() }
}
