// =============================================================================
// Birth-time rectification
// =============================================================================
// The single highest-leverage accuracy fix available, because it improves EVERY
// downstream prediction at once: the Ascendant, every house placement, every
// divisional chart and every dasha date all hang off the exact minute of birth.
// A +/-30 minute error moves the Lagna a whole sign and the first Mahadasha by
// months.
//
// `birth_time_rectified` and `birth_time_rectification_confidence` have existed
// as columns since the schema was written and were NEVER read or written by
// anything — someone intended this feature and it was never built.
//
// Method: score candidate birth times against dated life events the user has
// already told us about. For each candidate minute, cast the chart and ask how
// well its Vimshottari dasha periods line up with when things actually
// happened — the dasha lord ruling a life area should be running when an event
// in that area occurred. The candidate whose dasha sequence explains the most
// events wins.
//
// This is deliberately the DASHA-BASED method only. The classical alternatives
// (Tattva, Pranapada) are cross-checks a human astrologer applies by judgment;
// automating them would produce a confident number with nothing behind it.
// Standard practice puts 5-10 well-dated events at ~5-15 minutes of precision,
// which is why `minEvents` refuses to run below 3.
// =============================================================================

import { calculateChart } from './planetPositions.js';
import { calculateVimshottariDasha } from '../dashas/vimshottari.js';
import type { Ayanamsa, HouseSystem } from '@aroha-astrology/shared';

/** A dated thing that actually happened, used as evidence. */
export interface LifeEvent {
  /** 'YYYY-MM-DD'. */
  date: string;
  /** Which life area it belongs to — maps to the houses below. */
  domain:
    | 'job_started'
    | 'promotion'
    | 'job_loss'
    | 'business_started'
    | 'retirement'
    | 'engagement'
    | 'marriage'
    | 'divorce'
    | 'childbirth'
    | 'bereavement'
    | 'property_bought'
    | 'vehicle_bought'
    | 'big_financial_gain'
    | 'relocation'
    | 'health_crisis'
    | 'accident_injury'
    | 'legal_case'
    | 'foreign_travel'
    | 'education_milestone';
}

/**
 * Houses classically implicated in each kind of event. A dasha lord that rules
 * or occupies one of these when the event happened is evidence FOR that
 * candidate birth time.
 */
const DOMAIN_HOUSES: Record<LifeEvent['domain'], number[]> = {
  // --- Career. Split up because "career" alone is ambiguous: a job STARTING and
  // a job ENDING implicate almost opposite houses, so one label let
  // contradictory events score the same candidate and blunted the signal.
  job_started: [10, 6, 11], // 10th karma, 6th service/employment, 11th gains
  promotion: [10, 11, 6],
  job_loss: [10, 8, 12], // 8th upheaval, 12th loss — NOT the 11th
  business_started: [10, 7, 11], // 7th trade/partnership
  retirement: [10, 12, 8], // the 10th closing out

  // --- Relationships
  engagement: [7, 11, 2], // usually remembered as precisely as the wedding
  marriage: [7, 2, 11],
  divorce: [7, 8, 12], // the 8th ends the 7th; 12th separation

  // --- Family
  childbirth: [5, 9, 2],
  bereavement: [8, 12, 2], // 2nd is the classical maraka

  // --- Home and money
  property_bought: [4, 12, 11], // 4th home, 12th outlay, 11th means
  vehicle_bought: [4, 11, 12], // 4th is the vahana house
  big_financial_gain: [11, 2, 8], // 8th covers inheritance and windfalls
  relocation: [4, 3, 12],

  // --- Health and law
  health_crisis: [6, 8, 12], // serious illness, surgery, hospitalisation
  accident_injury: [8, 6, 12], // 8th sudden, 6th injury
  legal_case: [6, 8, 12], // 6th is litigation and adversaries

  // --- Travel and study
  foreign_travel: [12, 9, 3], // 12th foreign lands, 9th long journeys
  education_milestone: [4, 5, 9], // graduation, a decisive exam
};

export interface RectificationCandidate {
  /** Minutes offset from the stated birth time (negative = earlier). */
  offsetMinutes: number;
  /** 'HH:MM' of this candidate. */
  time: string;
  ascendantSign: string;
  /** How many of the given events this candidate's dashas explain. */
  matched: number;
  /** matched / total, 0-1. */
  score: number;
}

export interface RectificationResult {
  best: RectificationCandidate;
  candidates: RectificationCandidate[];
  /** LOW unless the evidence is genuinely strong — see the thresholds below. */
  confidence: 'low' | 'medium' | 'high';
  /** Why this confidence, in words a human can argue with. */
  reasoning: string;
}

function toHHMM(hour: number, minute: number): string {
  const h = ((hour % 24) + 24) % 24;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Does the dasha running on `date` implicate a house this domain cares about?
 *
 * Uses the Mahadasha and Antardasha lords: the event should fall while a lord
 * that rules or sits in one of the domain's houses is active. This is the
 * standard rectification test, deliberately coarse — it is a scoring signal
 * across many candidates, not a claim about any single event.
 */
interface PeriodLike {
  planet: string;
  startDate: Date | string;
  endDate: Date | string;
  subPeriods?: PeriodLike[];
}

/** The Maha and Antar lords active on `date`, walking one level of subPeriods. */
function activeLords(mahadashas: PeriodLike[], at: number): string[] {
  const lords: string[] = [];
  for (const maha of mahadashas) {
    const start = new Date(maha.startDate).getTime();
    const end = new Date(maha.endDate).getTime();
    if (!(start <= at && at < end)) continue;
    lords.push(maha.planet);
    for (const antar of maha.subPeriods ?? []) {
      const aStart = new Date(antar.startDate).getTime();
      const aEnd = new Date(antar.endDate).getTime();
      if (aStart <= at && at < aEnd) lords.push(antar.planet);
    }
  }
  return lords;
}

function dashaExplainsEvent(
  chart: {
    planets: Array<{ planet: string; house: number }>;
    houses: Array<{ house: number; lord: string }>;
  },
  mahadashas: PeriodLike[],
  event: LifeEvent,
): boolean {
  const wantedHouses = new Set(DOMAIN_HOUSES[event.domain]);

  const lordsOfWantedHouses = new Set(
    chart.houses.filter((h) => wantedHouses.has(h.house)).map((h) => h.lord),
  );
  const occupantsOfWantedHouses = new Set(
    chart.planets.filter((p) => wantedHouses.has(p.house)).map((p) => p.planet),
  );

  const at = new Date(`${event.date}T12:00:00Z`).getTime();
  if (!Number.isFinite(at)) return false;

  const active = activeLords(mahadashas, at);
  if (active.length === 0) return false;

  return active.some((lord) => lordsOfWantedHouses.has(lord) || occupantsOfWantedHouses.has(lord));
}

export interface RectifyInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  tzOffset: number;
  lat: number;
  lng: number;
  events: LifeEvent[];
  ayanamsa?: Ayanamsa;
  houseSystem?: HouseSystem;
  /** How far either side of the stated time to search. Default +/-60 min. */
  windowMinutes?: number;
  /** Candidate spacing. Default 4 min — finer than the Lagna moves anyway. */
  stepMinutes?: number;
}

/** Fewer than this many dated events cannot support a rectification claim. */
export const MIN_EVENTS_FOR_RECTIFICATION = 3;

/**
 * Searches for the birth minute whose dashas best explain the given events.
 *
 * Returns `null` rather than a guess when there is not enough evidence — an
 * unsupported rectification is worse than none, because every later prediction
 * would inherit a confidently wrong Lagna.
 */
export async function rectifyBirthTime(input: RectifyInput): Promise<RectificationResult | null> {
  const events = input.events.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
  if (events.length < MIN_EVENTS_FOR_RECTIFICATION) return null;

  const windowMinutes = input.windowMinutes ?? 60;
  const stepMinutes = input.stepMinutes ?? 4;
  const ayanamsa = input.ayanamsa ?? 'lahiri';
  const houseSystem = input.houseSystem ?? 'W';

  const candidates: RectificationCandidate[] = [];

  for (let offset = -windowMinutes; offset <= windowMinutes; offset += stepMinutes) {
    const totalMinutes = input.hour * 60 + input.minute + offset;
    const hour = Math.floor((((totalMinutes % 1440) + 1440) % 1440) / 60);
    const minute = ((totalMinutes % 60) + 60) % 60;

    let chart;
    try {
      chart = await calculateChart(
        input.year,
        input.month,
        input.day,
        hour,
        minute,
        input.tzOffset,
        input.lat,
        input.lng,
        ayanamsa,
        houseSystem,
      );
    } catch {
      continue; // a candidate that cannot be cast is simply not a candidate
    }

    const moon = chart.planets.find((p) => p.planet === 'Moon');
    const birthDate = new Date(
      Date.UTC(input.year, input.month - 1, input.day, hour, minute) - input.tzOffset * 3_600_000,
    );
    const dasha = calculateVimshottariDasha(moon?.longitude ?? 0, birthDate) as unknown as {
      mahadashas?: PeriodLike[];
    };
    const mahadashas = dasha.mahadashas ?? [];

    let matched = 0;
    for (const event of events) {
      if (dashaExplainsEvent(chart, mahadashas, event)) matched++;
    }

    candidates.push({
      offsetMinutes: offset,
      time: toHHMM(hour, minute),
      ascendantSign: String(chart.ascendant.sign),
      matched,
      score: matched / events.length,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort(
    (a, b) => b.matched - a.matched || Math.abs(a.offsetMinutes) - Math.abs(b.offsetMinutes),
  );
  const best = candidates[0]!;

  // Confidence is about how DECISIVE the winner is, not how high it scored.
  // A candidate matching 5/5 means nothing if 30 other minutes also match 5/5 —
  // that is a flat landscape, and the stated time is as good as any other.
  const equallyGood = candidates.filter((c) => c.matched === best.matched).length;
  const spreadMinutes = equallyGood * stepMinutes;

  let confidence: RectificationResult['confidence'] = 'low';
  let reasoning: string;

  if (best.score >= 0.8 && spreadMinutes <= 20) {
    confidence = 'high';
    reasoning = `${best.matched} of ${events.length} events line up, and only a ${spreadMinutes}-minute band scores that well.`;
  } else if (best.score >= 0.6 && spreadMinutes <= 40) {
    confidence = 'medium';
    reasoning = `${best.matched} of ${events.length} events line up, within a ${spreadMinutes}-minute band.`;
  } else {
    reasoning = `Only ${best.matched} of ${events.length} events line up, and a ${spreadMinutes}-minute band scores equally well — not enough to move the stated time.`;
  }

  return { best, candidates, confidence, reasoning };
}
