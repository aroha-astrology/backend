// @ts-nocheck
import type { SadeSati, SaturnStay, ZodiacSign } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { dateToJulianDay, calculatePlanetPositions } from '../calculations/planetPositions';
import { istDateString } from '../../astro-tools/transit-events.js';
import { detectRealSadeSati } from './saturnPhaseTimeline';

/**
 * Sade Sati Detection
 *
 * Saturn transiting over the natal Moon sign and the signs immediately
 * before and after it constitutes Sade Sati (7.5-year Saturn transit).
 *
 * - Rising phase: Saturn in sign before Moon sign (~2.5 years)
 * - Peak phase: Saturn in same sign as Moon (~2.5 years)
 * - Setting phase: Saturn in sign after Moon sign (~2.5 years)
 *
 * All calculations are deterministic based on Saturn's current sidereal longitude.
 */

/** Average Saturn transit time per sign in days (~2.5 years). */
const SATURN_DAYS_PER_SIGN = 912; // ~2.5 years * 365.25

function getSignIndex(sign: ZodiacSign): number {
  return ZODIAC_SIGNS.indexOf(sign);
}

function getSignFromLongitude(longitude: number): ZodiacSign {
  const index = Math.floor(longitude / 30) % 12;
  return ZODIAC_SIGNS[index];
}

function getSignIndexFromLongitude(longitude: number): number {
  return Math.floor(longitude / 30) % 12;
}

export function detectSadeSati(
  moonSign: ZodiacSign,
  saturnLongitude: number,
  /** The real window from Saturn's sign changes, when the caller has it (see detectCurrentSadeSati). */
  realWindow?: { start: Date; end: Date; stays?: SaturnStay[] },
): SadeSati {
  const moonSignIndex = getSignIndex(moonSign);
  const saturnSignIndex = getSignIndexFromLongitude(saturnLongitude);
  const saturnSign = ZODIAC_SIGNS[saturnSignIndex];

  // Determine relative position of Saturn to Moon sign
  const risingSignIndex = (moonSignIndex - 1 + 12) % 12; // sign before Moon
  const settingSignIndex = (moonSignIndex + 1) % 12; // sign after Moon

  let phase: SadeSati['phase'] = 'none';
  let active = false;

  if (saturnSignIndex === risingSignIndex) {
    phase = 'rising';
    active = true;
  } else if (saturnSignIndex === moonSignIndex) {
    phase = 'peak';
    active = true;
  } else if (saturnSignIndex === settingSignIndex) {
    phase = 'setting';
    active = true;
  }

  let severity: SadeSati['severity'] = 'none';
  if (phase === 'peak') {
    severity = 'severe';
  } else if (phase === 'rising') {
    severity = 'moderate';
  } else if (phase === 'setting') {
    severity = 'mild';
  }

  // Estimate start and end dates based on Saturn's degree within the current sign
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (active) {
    const saturnDegreeInSign = saturnLongitude % 30;
    const fractionThroughSign = saturnDegreeInSign / 30;

    // Days elapsed in current sign
    const daysElapsed = Math.round(fractionThroughSign * SATURN_DAYS_PER_SIGN);
    // Days remaining in current sign
    const daysRemaining = SATURN_DAYS_PER_SIGN - daysElapsed;

    const now = new Date();

    // Estimate when Saturn entered the rising sign (start of Sade Sati)
    if (phase === 'rising') {
      // Saturn is in the rising sign; Sade Sati started daysElapsed ago
      startDate = new Date(now.getTime() - daysElapsed * 86400000);
      // Sade Sati ends when Saturn leaves the setting sign = remaining in this sign + 2 more signs
      endDate = new Date(now.getTime() + (daysRemaining + 2 * SATURN_DAYS_PER_SIGN) * 86400000);
    } else if (phase === 'peak') {
      // Saturn is on Moon sign; started 1 sign ago
      startDate = new Date(now.getTime() - (daysElapsed + SATURN_DAYS_PER_SIGN) * 86400000);
      endDate = new Date(now.getTime() + (daysRemaining + SATURN_DAYS_PER_SIGN) * 86400000);
    } else if (phase === 'setting') {
      // Saturn is in the setting sign; started 2 signs ago
      startDate = new Date(now.getTime() - (daysElapsed + 2 * SATURN_DAYS_PER_SIGN) * 86400000);
      endDate = new Date(now.getTime() + daysRemaining * 86400000);
    }
  }

  // The arithmetic above assumes 912 days per sign and no retrograde, and can
  // be more than a year out (audit item DS6). The real window wins when given.
  if (active && realWindow) {
    startDate = realWindow.start;
    endDate = realWindow.end;
  }

  let description = '';
  if (active) {
    const phaseLabel: Record<'rising' | 'peak' | 'setting', string> = {
      rising: 'rising (first) phase',
      peak: 'peak (second) phase',
      setting: 'setting (third) phase',
    };
    // India's calendar date: a UTC date put the 3 Jun 2027 06:17 IST ingress on 2 Jun.
    const range =
      startDate && endDate
        ? ` ${realWindow ? 'It runs' : 'Estimated to run'} from ${istDateString(startDate)} to ${istDateString(endDate)}.`
        : '';
    description = `Saturn is transiting ${saturnSign}, marking the ${phaseLabel[phase as 'rising' | 'peak' | 'setting']} of Sade Sati for your Moon in ${moonSign}.${range}${breaksSentence(realWindow?.stays ?? [], 'the Sade Sati')}`;
  }

  return {
    active,
    phase,
    startDate,
    endDate,
    severity,
    saturnSign,
    moonSign,
    description,
  };
}

/**
 * Saturn's live sidereal longitude as of `asOf` (default now). Unlike a
 * natal chart's Saturn placement, this changes as Saturn actually transits —
 * it's the only correct input for Sade Sati, which is a TRANSIT dosha.
 */
export async function getCurrentSaturnLongitude(asOf: Date = new Date()): Promise<number> {
  const jd = await dateToJulianDay(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth() + 1,
    asOf.getUTCDate(),
    asOf.getUTCHours(),
    asOf.getUTCMinutes(),
    0,
  );
  const positions = await calculatePlanetPositions(jd);
  const saturn = positions.find((p) => p.planet === 'Saturn');
  return saturn?.longitude ?? 0;
}

/**
 * " Saturn steps out from A to B on a retrograde, so <what> pauses then." for
 * every break between real stays, or '' for one unbroken stay.
 */
export function breaksSentence(stays: SaturnStay[], what: string): string {
  if (stays.length < 2) return '';
  const breaks = stays
    .slice(1)
    .map((s, i) => `${istDateString(stays[i]!.endDate)} to ${istDateString(s.startDate)}`);
  return ` Saturn steps out on a retrograde from ${breaks.join(' and from ')}, so ${what} pauses then.`;
}

/**
 * Sade Sati detection using Saturn's live transiting position (see
 * `getCurrentSaturnLongitude`), with its dates, retrograde breaks and the
 * next Sade Sati from Saturn's real sign changes.
 */
export async function detectCurrentSadeSati(moonSign: ZodiacSign, asOf?: Date): Promise<SadeSati> {
  const saturnLongitude = await getCurrentSaturnLongitude(asOf);
  const estimate = detectSadeSati(moonSign, saturnLongitude);

  // Scan from the start of the UTC day so every reader on the same day shares
  // the same ephemeris cache entries. Nine years back covers the longest
  // window; 33 ahead reaches the whole next Sade Sati for every Moon sign (it
  // starts at most nine signs of Saturn, about 22.5 years, after one ends, and
  // lasts up to about 8.5).
  const at = asOf ?? new Date();
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  try {
    const real = await detectRealSadeSati(getSignIndex(moonSign), day, 9, 33);
    if (estimate.active && real.window) {
      return {
        ...detectSadeSati(moonSign, saturnLongitude, {
          start: real.window.startDate,
          end: real.window.endDate,
          stays: real.window.stays,
        }),
        stays: real.window.stays,
        resumesOn: null,
        next: null,
      };
    }
    if (!estimate.active && real.window && real.resumesOn) {
      // On a retrograde break: not active, but the reader is still inside it.
      return {
        ...estimate,
        startDate: real.window.startDate,
        endDate: real.window.endDate,
        stays: real.window.stays,
        resumesOn: real.resumesOn,
        next: null,
        description: `Sade Sati is on a break: Saturn has stepped back into ${estimate.saturnSign}, outside the three signs around your Moon in ${moonSign}, and returns on ${istDateString(real.resumesOn)}. The whole Sade Sati runs from ${istDateString(real.window.startDate)} to ${istDateString(real.window.endDate)}.`,
      };
    }
    return {
      ...estimate,
      stays: [],
      resumesOn: null,
      next: real.next ? { startDate: real.next.startDate, endDate: real.next.endDate } : null,
    };
  } catch {
    // An ephemeris failure leaves the estimate in place rather than no answer.
  }
  return estimate;
}
