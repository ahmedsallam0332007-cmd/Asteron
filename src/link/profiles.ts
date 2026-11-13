/**
 * Link profiles. Every number is either real NASA data or labelled as an assumption.
 * See docs/REAL_DATA_PRINCIPLE.md.
 */
export type ProfileId = 'iss' | 'moon' | 'mars'

export interface LinkProfile {
  id: ProfileId
  label: string
  /** Data rate available to the crew for downlink, bits per second. */
  rateBps: number
  rateSource: string
  /** Contact schedule. 'continuous' = always in contact (ISS via TDRS, >99%). */
  schedule: { kind: 'continuous' } | { kind: 'passes'; startsUtcHour: number[]; hours: number }
  scheduleSource: string
  /** Fixed one-way time for ISS (no ephemeris needed); Moon/Mars use JPL Horizons distances. */
  fixedOneWaySec?: number
  /** Solar conjunction blackout rule (Mars only). */
  conjunction?: { maxSotDeg: number; bufferDays: number; source: string }
}

export const PROFILES: Record<ProfileId, LinkProfile> = {
  iss: {
    id: 'iss',
    label: 'Space station (low Earth orbit)',
    rateBps: 600e6,
    rateSource: 'NASA: ISS Ku-band link via TDRS upgraded to 600 Mbps (2019).',
    schedule: { kind: 'continuous' },
    scheduleSource: 'NASA: TDRS covers more than 99% of every ISS orbit.',
    fixedOneWaySec: 0.25,
  },
  moon: {
    id: 'moon',
    label: 'Moon',
    rateBps: 28e6,
    rateSource: 'Real DSN Now reading (13 Nov 2026): JWST K-band downlink at 28 Mbps from ~1.5 million km, used here as a deep-space Ka/K-band reference. Assumption for a crewed lunar link.',
    schedule: { kind: 'continuous' },
    scheduleSource: 'Assumption: a crewed lunar mission is tracked near-continuously by the DSN; brief losses (for example behind the Moon) are not modelled.',
  },
  mars: {
    id: 'mars',
    label: 'Mars',
    rateBps: 2e6,
    rateSource: 'NASA: Mars relay orbiters (MRO, MAVEN, TGO) receive up to 2 Mbps over UHF; direct-to-Earth X-band from a rover is only 160–500 bit/s.',
    schedule: { kind: 'passes', startsUtcHour: [2, 14], hours: 6 },
    scheduleSource: 'Assumption modelled on JWST practice (two DSN contacts a day, up to 12 h). Real future DSN pass times are not published in advance.',
    conjunction: {
      maxSotDeg: 2,
      bufferDays: 1,
      source: 'NASA: commands stop while Mars is within 2° of the Sun as seen from Earth. With a 1-day buffer this reproduces NASA\'s announced 11–25 Nov 2023 moratorium from JPL Horizons data.',
    },
  },
}

export const C_KM_S = 299_792.458
