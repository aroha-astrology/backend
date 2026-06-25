// @ts-nocheck
import type {
  DashaPeriod,
  VimshottariDasha,
  Planet,
} from '@aroha-astrology/shared';

import {
  VIMSHOTTARI_ORDER,
  VIMSHOTTARI_YEARS,
  VIMSHOTTARI_TOTAL_YEARS,
  NAKSHATRA_LORDS,
  NAKSHATRA_SPAN,
} from '@aroha-astrology/shared';

// ============================================================
// Helpers
// ============================================================

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;

/** Add a fractional number of years to a Date, returning a new Date. */
function addYears(date: Date, years: number): Date {
  return new Date(date.getTime() + years * MS_PER_YEAR);
}

/** Is `date` within [start, end)? */
function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t < end.getTime();
}

// ============================================================
// Core: Nakshatra from Moon longitude
// ============================================================

/**
 * Returns the 0-based nakshatra index for a given sidereal Moon longitude (0-360).
 */
function getNakshatraIndex(moonLongitude: number): number {
  const normalized = ((moonLongitude % 360) + 360) % 360;
  return Math.floor(normalized / NAKSHATRA_SPAN);
}

/**
 * Returns the fraction of the nakshatra already traversed by the Moon.
 * 0 = Moon is at the very start; 1 = Moon is at the very end.
 */
function getNakshatraTraversedFraction(moonLongitude: number): number {
  const normalized = ((moonLongitude % 360) + 360) % 360;
  const posInNakshatra = normalized % NAKSHATRA_SPAN;
  return posInNakshatra / NAKSHATRA_SPAN;
}

// ============================================================
// Sub-period generation (recursive, up to 5 levels)
// ============================================================

type DashaLevel = DashaPeriod['level'];

const LEVEL_SEQUENCE: DashaLevel[] = [
  'mahadasha',
  'antardasha',
  'pratyantardasha',
  'sookshma',
  'prana',
];

/**
 * Build sub-periods for a given parent period.
 *
 * Within every dasha level the 9 planets cycle in Vimshottari order,
 * starting from the planet that owns the parent period.  The duration
 * of each sub-lord's period is proportional to the Vimshottari year
 * allocation of both the parent planet and the sub-lord planet:
 *
 *   subDuration = parentDuration * (subLordYears / VIMSHOTTARI_TOTAL_YEARS)
 *
 * @param startPlanet  Planet that owns the parent period.
 * @param startDate    Start date of the parent period.
 * @param parentYears  Duration of the parent period **in years**.
 * @param depth        0 = mahadasha, 1 = antardasha, ... 4 = prana.
 * @param currentDate  "Now" – used only to set `isActive` flags.
 * @param maxDepth     Deepest level to calculate (default 4 = prana).
 */
function buildSubPeriods(
  startPlanet: Planet,
  startDate: Date,
  parentYears: number,
  depth: number,
  currentDate: Date,
  maxDepth: number = 4,
): DashaPeriod[] {
  if (depth > maxDepth) return [];

  const level = LEVEL_SEQUENCE[depth];
  const startIdx = VIMSHOTTARI_ORDER.indexOf(startPlanet);

  const periods: DashaPeriod[] = [];
  let cursor = new Date(startDate.getTime());

  for (let i = 0; i < 9; i++) {
    const planet = VIMSHOTTARI_ORDER[(startIdx + i) % 9];
    const durationYears =
      parentYears * (VIMSHOTTARI_YEARS[planet] / VIMSHOTTARI_TOTAL_YEARS);
    const endDate = addYears(cursor, durationYears);
    const isActive = isDateInRange(currentDate, cursor, endDate);

    const period: DashaPeriod = {
      planet,
      startDate: new Date(cursor.getTime()),
      endDate,
      isActive,
      level,
      subPeriods: isActive
        ? buildSubPeriods(planet, cursor, durationYears, depth + 1, currentDate, maxDepth)
        : [],
    };

    periods.push(period);
    cursor = endDate;
  }

  return periods;
}

// ============================================================
// Main entry point
// ============================================================

/**
 * Calculate the full Vimshottari Dasha tree for a given Moon longitude
 * and birth date.
 *
 * The starting Mahadasha lord is the nakshatra lord of the Moon's birth
 * nakshatra.  The **balance** of the first dasha is the remaining
 * (un-traversed) fraction of that nakshatra multiplied by the lord's
 * total dasha years.
 *
 * Five levels are computed for the currently active branch:
 * Mahadasha -> Antardasha -> Pratyantardasha -> Sookshma -> Prana.
 *
 * @param moonLongitude  Sidereal longitude of the Moon (0-360 degrees).
 * @param birthDate      Date/time of birth.
 * @returns              A `VimshottariDasha` object.
 */
export function calculateVimshottariDasha(
  moonLongitude: number,
  birthDate: Date,
): VimshottariDasha {
  const now = new Date();

  // 1. Determine starting dasha lord from Moon's nakshatra
  const nakshatraIdx = getNakshatraIndex(moonLongitude);
  const startingLord: Planet = NAKSHATRA_LORDS[nakshatraIdx];

  // 2. Balance of the first dasha
  //    The fraction of the nakshatra already traversed has been "used up",
  //    so the remaining fraction gives the balance.
  const traversed = getNakshatraTraversedFraction(moonLongitude);
  const balanceFraction = 1 - traversed;
  const firstDashaFullYears = VIMSHOTTARI_YEARS[startingLord];
  const firstDashaBalanceYears = firstDashaFullYears * balanceFraction;

  // 3. Build mahadashas covering 120 years from birth.
  //    The first dasha uses the balance; subsequent dashas use full years.
  //    After the first 9 planets the sequence wraps, but the total of
  //    balance + remaining 8 full dashas + wrap-around always equals 120 years.
  const startIdx = VIMSHOTTARI_ORDER.indexOf(startingLord);

  const mahadashas: DashaPeriod[] = [];
  let cursor = new Date(birthDate.getTime());
  let accumulatedYears = 0;
  let periodCount = 0;

  while (accumulatedYears < VIMSHOTTARI_TOTAL_YEARS) {
    const planet = VIMSHOTTARI_ORDER[(startIdx + periodCount) % 9];

    let durationYears: number;
    if (periodCount === 0) {
      // First mahadasha uses the balance
      durationYears = firstDashaBalanceYears;
    } else {
      durationYears = VIMSHOTTARI_YEARS[planet];
    }

    // Clamp so we don't exceed 120 years total
    if (accumulatedYears + durationYears > VIMSHOTTARI_TOTAL_YEARS) {
      durationYears = VIMSHOTTARI_TOTAL_YEARS - accumulatedYears;
    }

    const endDate = addYears(cursor, durationYears);
    const isActive = isDateInRange(now, cursor, endDate);

    const period: DashaPeriod = {
      planet,
      startDate: new Date(cursor.getTime()),
      endDate,
      isActive,
      level: 'mahadasha',
      // Compute deeper levels only for the active branch (performance)
      subPeriods: isActive
        ? buildSubPeriods(planet, cursor, durationYears, 1, now, 4)
        : [],
    };

    mahadashas.push(period);
    accumulatedYears += durationYears;
    cursor = endDate;
    periodCount++;
  }

  // 4. Find currently active periods at each level
  const currentMahadasha = mahadashas.find((p) => p.isActive) ?? mahadashas[0];
  const currentAntardasha =
    currentMahadasha.subPeriods.find((p) => p.isActive) ??
    currentMahadasha.subPeriods[0];
  const currentPratyantardasha =
    currentAntardasha?.subPeriods.find((p) => p.isActive) ??
    currentAntardasha?.subPeriods[0];

  return {
    mahadashas,
    currentMahadasha,
    currentAntardasha,
    currentPratyantardasha,
  };
}

