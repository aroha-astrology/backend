// @ts-nocheck
import type {
  ZodiacSign,
  ChartData,
  CharaDasha,
  Planet,
} from '@aroha-astrology/shared';

import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';

// ============================================================
// Helpers
// ============================================================

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;

function addYears(date: Date, years: number): Date {
  return new Date(date.getTime() + years * MS_PER_YEAR);
}

function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t < end.getTime();
}

/**
 * Get the 0-based index of a zodiac sign.
 */
function signIndex(sign: ZodiacSign): number {
  return ZODIAC_SIGNS.indexOf(sign);
}

/**
 * Get the zodiac sign at a 0-based index (wraps around).
 */
function signAt(index: number): ZodiacSign {
  return ZODIAC_SIGNS[((index % 12) + 12) % 12];
}

/**
 * Whether a sign is odd-footed (Aries, Gemini, Leo, Libra, Sagittarius, Aquarius)
 * i.e. signs with 0-based index 0, 2, 4, 6, 8, 10.
 */
function isOddSign(sign: ZodiacSign): boolean {
  return signIndex(sign) % 2 === 0;
}

// ============================================================
// Jaimini sign aspects / lord position helpers
// ============================================================

/**
 * Find the longitude of a planet in the chart, returning the sign it occupies.
 */
function getPlanetSign(chartData: ChartData, planet: Planet): ZodiacSign {
  const pos = chartData.planets.find((p) => p.planet === planet);
  if (!pos) {
    // Fallback: shouldn't happen with valid chart data
    return 'Aries';
  }
  return pos.sign;
}

/**
 * Calculate the forward distance (in signs, 1-12) from `fromSign` to `toSign`.
 */
function forwardDistance(from: ZodiacSign, to: ZodiacSign): number {
  const diff = ((signIndex(to) - signIndex(from)) % 12 + 12) % 12;
  return diff === 0 ? 12 : diff;
}

/**
 * Calculate the backward distance (in signs, 1-12) from `fromSign` to `toSign`.
 */
function backwardDistance(from: ZodiacSign, to: ZodiacSign): number {
  const diff = ((signIndex(from) - signIndex(to)) % 12 + 12) % 12;
  return diff === 0 ? 12 : diff;
}

// ============================================================
// Chara Dasha duration calculation
// ============================================================

/**
 * Determine the Jaimini lord of a sign.
 *
 * For most signs this is the standard sign lord. However, for Scorpio
 * and Aquarius, Jaimini uses a dual-lordship rule:
 *   - Scorpio: Mars and Ketu. Use whichever is stronger (here: the one
 *     further advanced in its sign, i.e. higher signDegree).
 *   - Aquarius: Saturn and Rahu. Same strength rule.
 *
 * If both planets are in the same sign-degree we fall back to the
 * traditional lord (Mars for Scorpio, Saturn for Aquarius).
 */
function jaiminiSignLord(sign: ZodiacSign, chartData: ChartData): Planet {
  if (sign === 'Scorpio') {
    const marsPos = chartData.planets.find((p) => p.planet === 'Mars');
    const ketuPos = chartData.planets.find((p) => p.planet === 'Ketu');
    if (marsPos && ketuPos) {
      // Higher degree within its sign = stronger
      return ketuPos.signDegree > marsPos.signDegree ? 'Ketu' : 'Mars';
    }
    return 'Mars';
  }
  if (sign === 'Aquarius') {
    const saturnPos = chartData.planets.find((p) => p.planet === 'Saturn');
    const rahuPos = chartData.planets.find((p) => p.planet === 'Rahu');
    if (saturnPos && rahuPos) {
      return rahuPos.signDegree > saturnPos.signDegree ? 'Rahu' : 'Saturn';
    }
    return 'Saturn';
  }
  return SIGN_LORDS[sign];
}

/**
 * Calculate the Chara Dasha duration (in years) for a given sign.
 *
 * Rules:
 * 1. Find the Jaimini lord of the sign.
 * 2. Find which sign the lord occupies in the chart.
 * 3. If the sign is odd (Aries, Gemini, Leo, Libra, Sagittarius, Aquarius):
 *      duration = forward distance from sign to lord's sign.
 *    If the sign is even (Taurus, Cancer, Virgo, Scorpio, Capricorn, Pisces):
 *      duration = backward distance from sign to lord's sign.
 * 4. Exception: if the lord is in its own sign, duration = 12 years.
 * 5. Some traditions subtract 1 from the count when the lord is in the
 *    sign itself (giving 0), then use 12 instead. We follow the rule
 *    that the distance includes the starting sign, so lord in own sign = 12.
 *
 * Duration is capped at 12 years (one full zodiac).
 */
function charaDashaDuration(
  sign: ZodiacSign,
  chartData: ChartData,
): number {
  const lord = jaiminiSignLord(sign, chartData);
  const lordSign = getPlanetSign(chartData, lord);

  // Lord in own sign => 12 years
  if (lordSign === sign) {
    return 12;
  }

  let distance: number;
  if (isOddSign(sign)) {
    distance = forwardDistance(sign, lordSign);
  } else {
    distance = backwardDistance(sign, lordSign);
  }

  // The distance naturally falls in 1-12 range.
  // Some Jaimini texts use (distance - 1) as the period in years.
  // We follow the Parashari-Jaimini convention: direct count = years.
  return distance;
}

// ============================================================
// Dasha sign sequence
// ============================================================

/**
 * Generate the sequence of 12 signs for Chara Dasha starting from
 * the ascendant.
 *
 * - If the ascendant is an odd sign: signs proceed in direct (forward) order.
 * - If the ascendant is an even sign: signs proceed in reverse order.
 */
function charaDashaSignSequence(ascendantSign: ZodiacSign): ZodiacSign[] {
  const ascIdx = signIndex(ascendantSign);
  const forward = isOddSign(ascendantSign);
  const signs: ZodiacSign[] = [];

  for (let i = 0; i < 12; i++) {
    if (forward) {
      signs.push(signAt(ascIdx + i));
    } else {
      signs.push(signAt(ascIdx - i));
    }
  }

  return signs;
}

// ============================================================
// Main entry point
// ============================================================

/**
 * Calculate the Chara (Jaimini) Dasha.
 *
 * This is a sign-based dasha system originating from Maharishi Jaimini.
 * The dasha sequence starts from the ascendant sign and progresses
 * forward (for odd ascendants) or backward (for even ascendants)
 * through all 12 signs.
 *
 * Each sign's period length depends on the distance between the sign
 * and its Jaimini lord's position in the chart.
 *
 * The full sequence of 12 signs is repeated as many times as needed
 * to cover 120 years from birth.
 *
 * @param ascendantSign  The ascendant (lagna) sign.
 * @param chartData      Full chart data with planet positions.
 * @returns              A `CharaDasha` object.
 */
export function calculateCharaDasha(
  ascendantSign: ZodiacSign,
  chartData: ChartData,
): CharaDasha {
  const now = new Date();
  // Extract birth date from chartData's julian day isn't directly available
  // as a Date, so we derive it from the ascendant or use the first house cusp.
  // However, the ChartData doesn't carry a birthDate directly.
  // We'll compute the birth date from the Julian Day in chartData.
  const birthDate = julianDayToDate(chartData.julianDay);

  const signSequence = charaDashaSignSequence(ascendantSign);

  // Pre-compute durations for each sign in the sequence
  const durations = signSequence.map((sign) =>
    charaDashaDuration(sign, chartData),
  );

  // Build sign dasha periods, cycling through the 12-sign sequence
  // until we cover at least 120 years.
  const TARGET_YEARS = 120;
  const signs: CharaDasha['signs'] = [];
  let cursor = new Date(birthDate.getTime());
  let accumulatedYears = 0;
  let seqIdx = 0;

  while (accumulatedYears < TARGET_YEARS) {
    const sign = signSequence[seqIdx % 12];
    let durationYears = durations[seqIdx % 12];

    if (accumulatedYears + durationYears > TARGET_YEARS) {
      durationYears = TARGET_YEARS - accumulatedYears;
    }

    const endDate = addYears(cursor, durationYears);
    const isActive = isDateInRange(now, cursor, endDate);

    signs.push({
      sign,
      startDate: new Date(cursor.getTime()),
      endDate,
      isActive,
    });

    accumulatedYears += durationYears;
    cursor = endDate;
    seqIdx++;
  }

  return { signs };
}

// ============================================================
// Julian Day to Date conversion
// ============================================================

/**
 * Convert a Julian Day Number to a JavaScript Date (UTC).
 *
 * Uses the standard algorithm from Meeus, "Astronomical Algorithms".
 */
function julianDayToDate(jd: number): Date {
  // JD -> calendar date algorithm
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;

  let a: number;
  if (z < 2299161) {
    a = z;
  } else {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }

  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);

  const day = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  // Fractional day -> hours, minutes, seconds
  const totalHours = f * 24;
  const hours = Math.floor(totalHours);
  const totalMinutes = (totalHours - hours) * 60;
  const minutes = Math.floor(totalMinutes);
  const seconds = Math.floor((totalMinutes - minutes) * 60);

  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
}

