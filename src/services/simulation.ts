import { content } from '../content'
import { GroundDB, StationDB } from '../data/db'
import { verifyAuditChain } from '../data/groundRepo'
import type { Provenance } from '../engine/types'
import { linkState } from '../link/contactPlan'
import { PreflightDB } from '../link/pairing'
import type { ProfileId } from '../link/profiles'
import { mulberry32, hashSeed } from '../sim/prng'
import { CREW, generateHistory, SCENARIOS } from '../sim'
import { generateDose, speDose } from '../sim/dose'
import { doseProfileOf, AsteronSystem } from './system'
import { LoopbackTransport, tamper, type Envelope } from './transport'
import type { Delivered, Launched } from './mission'

/**
 * Mission Simulator. Runs a whole mission automatically and records every actor and every bundle:
 *  - 6 crew check in every day with simulated sensors (badged SIM); illnesses start on planned days;
 *  - the station decides (tier and link-aware directive), seals and queues;
 *  - the link follows JPL Horizons geometry, relay passes and solar-conjunction blackouts;
 *  - an attacker alters bundles in transit on random days; the ground refuses them, custody resends them;
 *  - the flight surgeon acknowledges and resolves alerts; advice travels back; a solar storm warning goes up.
 * Everything is deterministic for a given seed.
 */
export interface SimOptions { profile: ProfileId; start: number; days: number; seed: number; stepMs?: number; attackRate?: number; storm?: boolean }
export interface BundleTrace {
  id: string; dir: 'down' | 'up'; kind: string; crewId: string; priority: number; bytes: number
  createdAt: number; sentAt?: number; arrivedAt?: number; sends: number; rejections: number; attacked: boolean
  outcome: 'delivered' | 'in-queue' | 'in-flight'
}
export interface TraceEvent { at: number; actor: 'station' | 'link' | 'ground' | 'surgeon' | 'attacker' | 'space-weather'; action: string; detail: string; crewId?: string; bundleId?: string }
export interface DayRecord {
  day: number; at: number
  station: Record<string, { overall: string; tier: number; directive: string }>
  ground: Record<string, { shown: string; dataAgeH: number | null }>
  link: { blackout: boolean; owltMin: number; contactHours: number }
}
export interface SimTrace {
  options: Required<SimOptions>
  crew: { id: string; name: string }[]
  daily: DayRecord[]
  bundles: BundleTrace[]
  events: TraceEvent[]
  plan: { day: number; crewId: string; label: string }[]
  summary: {
    checkins: number; bundles: number; delivered: number; rejected: number; queuedAtEnd: number; inFlightAtEnd: number; storedTwice: number
    medianDelayMin: number; maxDelayH: number; alerts: number; resolved: number; onboardDecisions: number; auditOk: boolean; auditEntries: number; attacks: number
  }
}

const DAY = 86_400_000
const H = 3_600_000

/** Planned illnesses, as day offsets from the mission start. Values replace the simulated sensors on those days. */
function illnessPlan(days: number) {
  const at = (f: number) => Math.min(days - 3, Math.max(1, Math.round(days * f)))
  const p = [
    { start: at(0.12), crewId: 'okafor', label: 'Sleep loss with rising workload', series: { sleep_h: [6.3, 5.6, 5.0], workload: [4, 5, 5], stress: [3, 4, 4] } },
    { start: at(0.25), crewId: 'varga', label: 'Infection: fever with fast heart rate', series: { temp: [37.3, 37.9, 38.4], hr_rest: [80, 90, 106] } },
    { start: at(0.4), crewId: 'haddad', label: 'Blood pressure rising', series: { bp_sys: [122, 130, 138], bp_dia: [80, 84, 88] } },
    { start: at(0.5), crewId: 'rahal', label: 'Severe infection with low oxygen', series: { temp: [37.6, 38.1, 38.6], hr_rest: [86, 98, 112], spo2: [96, 94, 91] } },
    { start: at(0.62), crewId: 'moreau', label: 'Vision change (possible SANS)', series: { sym_vision: [0, 1, 1] } },
    { start: at(0.7), crewId: 'sorokina', label: 'Headache with stress: check cabin CO2', series: { sym_headache: [1, 1, 1], stress: [3, 4, 4] } },
  ]
  return p.filter((x) => x.start + 2 < days)
}

class AttackTransport extends LoopbackTransport {
  armed = 0
  onAttack: (id: string) => void = () => {}
  post(e: Envelope) {
    if (e.dir === 'down' && this.armed > 0 && e.sealed.header.kind !== 'ack') {
      this.armed--
      this.onAttack(String(e.sealed.header.id))
      super.post(tamper(e))
    } else super.post(e)
  }
}

export async function runMission(opts: SimOptions, onProgress?: (f: number, note: string) => void): Promise<SimTrace> {
  const o: Required<SimOptions> = { stepMs: H, attackRate: 0.25, storm: true, ...opts }
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const stationDb = new StationDB(`asteron-sim-station-${id}`), groundDb = new GroundDB(`asteron-sim-ground-${id}`), preflight = new PreflightDB(`asteron-sim-preflight-${id}`)
  const transport = new AttackTransport()
  const sys = await AsteronSystem.boot({ stationDb, groundDb, preflight, transport, profile: o.profile, epoch: o.start, realNow: 0 })
  await sys.reset({ epoch: o.start, scenarioId: 'healthy', profile: o.profile, realNow: 0 })

  const rand = mulberry32(hashSeed(`mission:${o.seed}`))
  const bundles = new Map<string, BundleTrace>()
  const events: TraceEvent[] = []
  const ev = (e: TraceEvent) => events.push(e)
  let firstAccepts = 0
  const accepted = new Set<string>()

  const ensure = async (bid: string, dir: 'down' | 'up', at: number) => {
    let b = bundles.get(bid)
    if (b) return b
    const rec = await (dir === 'down' ? stationDb : groundDb).outbox.get(bid)
    b = { id: bid, dir, kind: rec?.kind ?? '?', crewId: rec?.crewId ?? '?', priority: rec?.priority ?? 0, bytes: rec?.bytes ?? 0, createdAt: rec?.createdAt ?? at, sends: 0, rejections: 0, attacked: false, outcome: 'in-queue' }
    bundles.set(bid, b)
    return b
  }
  transport.onAttack = (bid) => {
    const b = bundles.get(bid)
    if (b) b.attacked = true
    ev({ at: sys.missionNow(), actor: 'attacker', action: 'altered', detail: `Changed bytes of ${b?.kind ?? 'a bundle'} ${bid} in transit`, bundleId: bid, crewId: b?.crewId })
  }

  const handle = async (out: { down: Delivered[]; up: Delivered[]; launched: Launched[] }) => {
    for (const l of out.launched) {
      const b = await ensure(l.id, l.dir, l.completedAt)
      b.sends++
      b.sentAt ??= l.completedAt
      if (b.kind !== 'ack' && b.kind !== 'heartbeat') ev({ at: l.completedAt, actor: 'link', action: b.sends > 1 ? 'resent' : 'sent', detail: `${b.kind} ${l.dir === 'down' ? 'station → Earth' : 'Earth → station'}, arrives in ${Math.round((l.arrivesAt - l.completedAt) / 60_000)} min`, bundleId: l.id, crewId: b.crewId })
    }
    for (const [dir, list] of [['down', out.down], ['up', out.up]] as const) for (const d of list) {
      const b = await ensure(d.id, dir, d.arrivesAt)
      if (!d.ok) {
        b.rejections++
        ev({ at: d.arrivesAt, actor: dir === 'down' ? 'ground' : 'station', action: 'rejected', detail: `${b.kind} ${d.id}: ${d.reason}. Nothing stored; the sender will resend after the custody timeout.`, bundleId: d.id, crewId: b.crewId })
        continue
      }
      if (d.duplicate) continue
      if (accepted.has(d.id)) firstAccepts++
      accepted.add(d.id)
      b.arrivedAt = d.arrivesAt
      if (b.kind !== 'ack' && b.kind !== 'heartbeat') ev({ at: d.arrivesAt, actor: dir === 'down' ? 'ground' : 'station', action: 'verified', detail: `${b.kind} from ${dir === 'down' ? 'the station' : 'Earth'}: signature, decryption, SHA-256 and schema checked`, bundleId: d.id, crewId: b.crewId })
    }
  }

  const plan = illnessPlan(o.days)
  const healthy = SCENARIOS.find((s) => s.id === 'healthy')!
  const endIso = new Date(o.start + (o.days - 1) * DAY + 2 * H).toISOString()
  const series = new Map(CREW.map((c) => {
    const rs = generateHistory(c, healthy, content.indicators, endIso, o.days, `:${o.seed}`)
    const byInd: Record<string, number[]> = {}
    for (const r of rs) (byInd[r.indicatorId] ??= []).push(r.value)
    return [c.id, byInd]
  }))
  const doses = new Map(CREW.map((c) => [c.id, generateDose(c, doseProfileOf(o.profile), endIso, o.days)]))
  const stormDay = Math.max(1, Math.round(o.days * 0.8))
  let sheltered = false
  let checkins = 0, onboard = 0
  const daily: DayRecord[] = []
  const handledAlerts = new Set<string>()

  for (let day = 0; day < o.days; day++) {
    const dayStart = o.start + day * DAY
    const actions: { at: number; run: () => Promise<void> }[] = []
    CREW.forEach((c, i) => actions.push({ at: dayStart + 2 * H + i * 10 * 60_000, run: async () => {
      const vals = Object.fromEntries(content.indicators.map((ind) => [ind.id, series.get(c.id)![ind.id][day]]))
      let label = ''
      for (const p of plan) if (p.crewId === c.id && day >= p.start && day < p.start + 3) {
        for (const [k, arr] of Object.entries(p.series)) vals[k] = arr[day - p.start]
        label = p.label
      }
      const now = sys.missionNow()
      const sim: Provenance = { kind: 'simulated', generator: 'asteron-mission-sim', version: '1.0.0', seed: o.seed, scenarioId: 'mission' }
      const r = await sys.station.submitCheckIn({ crewId: c.id, values: vals, provenance: () => sim, now })
      checkins++
      const dose = doses.get(c.id)![day]
      await sys.station.recordDoses([{ ...dose, takenAt: new Date(now).toISOString() }])
      if (r.link.directive === 'onboard-protocol') onboard++
      if (r.assessment.tier.tier >= 2 || label) ev({ at: now, actor: 'station', action: r.link.directive === 'onboard-protocol' ? 'on-board protocol' : `tier ${r.assessment.tier.tier}`, detail: `${c.name}: ${r.assessment.overall.status}, tier ${r.assessment.tier.tier}. ${r.link.explanation}${label ? ` (planned case: ${label})` : ''}`, crewId: c.id })
    } }))
    actions.push({ at: dayStart + 20 * H, run: async () => { for (const c of CREW) await sys.station.sendDoseSummary(c.id, sys.missionNow()); await sys.station.heartbeat(sys.missionNow()) } })
    if (rand() < o.attackRate) actions.push({ at: dayStart + Math.floor(rand() * 20) * H, run: async () => { transport.armed++ } })
    if (o.storm && day === stormDay) actions.push({ at: dayStart + 12 * H, run: async () => {
      await sys.ground.sendSpaceWeather({ eventId: `spe-day-${day}`, message: 'Solar particle event detected; particles expected within hours.' }, sys.missionNow())
      ev({ at: sys.missionNow(), actor: 'space-weather', action: 'warning sent', detail: 'Ground sends a solar storm warning at the highest priority' })
    } })
    actions.sort((a, b) => a.at - b.at)

    let t = dayStart
    while (t < dayStart + DAY) {
      const nextAction = actions.find((a) => a.at > t)?.at ?? Infinity
      const next = Math.min(t + o.stepMs, nextAction, dayStart + DAY)
      await handle(await sys.advanceMission(next - sys.missionNow()))
      t = next
      while (actions.length && actions[0].at <= t) await actions.shift()!.run()

      // flight surgeon: acknowledge 20 min after an alert lands, resolve 40 min later with advice
      for (const a of await groundDb.alerts.where('state').anyOf('new', 'acknowledged').toArray()) {
        if (a.state === 'new' && t - a.firstSeen >= 20 * 60_000) {
          await sys.ground.acknowledgeAlert(a.id, 'Flight surgeon', t)
          ev({ at: t, actor: 'surgeon', action: 'acknowledged', detail: `${a.status} ${a.ruleId} for ${a.crewId}, data ${Math.round((t - a.dataCreatedAt) / 60_000)} min old`, crewId: a.crewId })
        } else if (a.state === 'acknowledged' && t - (a.history.at(-1)?.at ?? t) >= 40 * 60_000 && !handledAlerts.has(a.id)) {
          handledAlerts.add(a.id)
          await sys.ground.resolveAlert(a.id, 'Flight surgeon', `Reviewed ${a.ruleId}: follow the tier actions and send a new check-in in 4 h.`, t)
          ev({ at: t, actor: 'surgeon', action: 'resolved', detail: `${a.ruleId} for ${a.crewId}; advice queued up the link`, crewId: a.crewId })
        }
      }
      const sh = await sys.station.shelter()
      if (sh && !sheltered) {
        sheltered = true
        ev({ at: sh.receivedAt, actor: 'station', action: 'sheltered', detail: `Storm warning received ${Math.round((sh.receivedAt - o.start - stormDay * DAY - 12 * H) / 60_000)} min after it was sent; crew moves to the most shielded area` })
        const spe = speDose(doseProfileOf(o.profile), true)
        if (spe) for (const c of CREW) await sys.station.recordDoses([{ crewId: c.id, takenAt: new Date(sh.receivedAt).toISOString(), doseMsv: spe.doseMsv, kind: 'spe', provenance: { kind: 'simulated', generator: 'asteron-mission-sim', version: '1.0.0', seed: o.seed, scenarioId: 'spe' } }])
      }
    }

    const last = new Map<string, { overall: string; tier: number; directive: string }>()
    for (const e of (await stationDb.escalations.where('at').belowOrEqual(new Date(dayStart + DAY).toISOString()).sortBy('at'))) last.set(e.crewId, { overall: e.overall, tier: e.tier, directive: e.directive })
    const ov = await sys.ground.crewOverview(dayStart + DAY)
    let contactHours = 0
    for (let h = 0; h < 24; h++) { const s = linkState(o.profile, dayStart + h * H + 30 * 60_000); if (s.inContact) contactHours++ }
    const mid = linkState(o.profile, dayStart + 12 * H)
    daily.push({
      day, at: dayStart,
      station: Object.fromEntries(CREW.map((c) => [c.id, last.get(c.id) ?? { overall: 'unknown', tier: 1, directive: 'follow-tier' }])),
      ground: Object.fromEntries(ov.map((c) => [c.crewId, { shown: c.shownStatus, dataAgeH: c.dataAgeMs === null ? null : Math.round(c.dataAgeMs / H) }])),
      link: { blackout: !!mid.blackout, owltMin: Math.round(mid.oneWaySec / 60 * 10) / 10, contactHours },
    })
    onProgress?.((day + 1) / o.days, `Day ${day + 1} of ${o.days}`)
  }

  for (const r of await stationDb.outbox.toArray()) await ensure(r.id, 'down', r.createdAt)
  for (const r of await groundDb.outbox.toArray()) await ensure(r.id, 'up', r.createdAt)
  const sOut = new Map((await stationDb.outbox.toArray()).map((r) => [r.id, r.state]))
  const gOut = new Map((await groundDb.outbox.toArray()).map((r) => [r.id, r.state]))
  for (const b of bundles.values()) {
    const state = (b.dir === 'down' ? sOut : gOut).get(b.id)
    b.outcome = b.arrivedAt !== undefined ? 'delivered' : state === 'queued' || state === 'sending' ? 'in-queue' : 'in-flight'
  }
  const list = [...bundles.values()].sort((a, b) => a.createdAt - b.createdAt)
  const delays = list.filter((b) => b.arrivedAt !== undefined && b.kind !== 'ack').map((b) => b.arrivedAt! - b.createdAt).sort((a, b) => a - b)
  const audit = await verifyAuditChain(groundDb)
  const alerts = await groundDb.alerts.toArray()
  const trace: SimTrace = {
    options: o,
    crew: CREW.map((c) => ({ id: c.id, name: c.name })),
    daily, bundles: list, events: events.sort((a, b) => a.at - b.at),
    plan: plan.map((p) => ({ day: p.start, crewId: p.crewId, label: p.label })),
    summary: {
      checkins, bundles: list.length,
      delivered: list.filter((b) => b.outcome === 'delivered').length,
      rejected: events.filter((e) => e.action === 'rejected').length,
      queuedAtEnd: list.filter((b) => b.outcome === 'in-queue').length,
      inFlightAtEnd: list.filter((b) => b.outcome === 'in-flight').length,
      storedTwice: firstAccepts,
      medianDelayMin: delays.length ? Math.round(delays[Math.floor(delays.length / 2)] / 60_000) : 0,
      maxDelayH: delays.length ? Math.round((delays[delays.length - 1] / H) * 10) / 10 : 0,
      alerts: alerts.length, resolved: alerts.filter((a) => a.state === 'resolved').length,
      onboardDecisions: onboard, auditOk: audit.ok, auditEntries: audit.entries,
      attacks: events.filter((e) => e.actor === 'attacker').length,
    },
  }
  sys.close()
  stationDb.close(); groundDb.close(); preflight.close()
  void Promise.all([stationDb.delete(), groundDb.delete(), preflight.delete()]).catch(() => undefined)
  return trace
}
