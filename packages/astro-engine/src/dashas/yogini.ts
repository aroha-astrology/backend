import type { DashaPeriod, YoginiDasha, Planet } from '@aroha-astrology/shared';

import {
  YOGINI_YEARS,
  YOGINI_PLANETS,
  NAKSHATRA_SPAN,
} from '@aroha-astrology/shared';

// ============================================================
// Helpers
// ============================================================

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;
const YOGINI_TOTAL_YEARS = 36; // 1+2+3+4+5+6+7+8

function addYears(date: Date, years: number): Date {
  return new Date(date.getTime() + years * MS_PER_YEAR);
}

function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t < end.getTime();
}

// ============================================================
// Nakshatra helpers
// ============================================================

/**
 * Returns the 0-based nakshatra index (0-26) for a sidereal longitude.
 */
function getNakshatraIndex(moonLongitude: number): number {
  const normalized = ((moonLongitude % 360) + 360) % 360;
  return Math.floor(normalized / NAKSHATRA_SPAN);
}

/**
 * Fraction of the current nakshatra already traversed (0-1).
 */
function getNakshatraTraversedFraction(moonLongitude: number): number {
  const normalized = ((moonLongitude % 360) + 360) % 360;
  return (normalized % NAKSHATRA_SPAN) / NAKSHATRA_SPAN;
}

// ============================================================
// Starting Yogini
// ============================================================

/**
 * Determine the starting Yogini index (0-7) from the Moon's nakshatra.
 *
 * Traditional formula:
 *   startingYoginiIndex = (nakshatraIndex + 3) % 8
 *
 * nakshatraIndex is 0-based (Ashwini = 0 ... Revati = 26).
 */
function getStartingYoginiIndex(nakshatraIndex: number): number {
  return (nakshatraIndex + 3) % 8;
}

// ============================================================
// Antardasha builder
// ============================================================

/**
 * Build Antardasha sub-periods within a Yogini Mahadasha.
 *
 * Within each Yogini mahadasha the 8 yogini antardashas cycle starting
 * from the mahadasha yogini herself.  Each antardasha duration is
 * proportional:
 *
 *   antardashaYears = mahadashaDuration * (antarYoginiYears / YOGINI_TOTAL_YEARS)
 */
function buildYoginiAntardashas(
  startYoginiIdx: number,
  startDate: Date,
  mahadashaDurationYears: number,
  currentDate: Date,
): DashaPeriod[] {
  const periods: DashaPeriod[] = [];
  let cursor = new Date(startDate.getTime());

  for (let i = 0; i < 8; i++) {
    const idx = (startYoginiIdx + i) % 8;
    const planet: Planet = YOGINI_PLANETS[idx];
    const durationYears =
      mahadashaDurationYears * (YOGINI_YEARS[idx] / YOGINI_TOTAL_YEARS);
    const endDate = addYears(cursor, durationYears);
    const isActive = isDateInRange(currentDate, cursor, endDate);

    periods.push({
      planet,
      startDate: new Date(cursor.getTime()),
      endDate,
      isActive,
      level: 'antardasha',
      subPeriods: [],
    });

    cursor = endDate;
  }

  return periods;
}

// ============================================================
// Main entry point
// ============================================================

/**
 * Calculate the Yogini Dasha system.
 *
 * The Yogini Dasha is a 36-year cycle with 8 yoginis:
 *   Mangala(1/Moon), Pingala(2/Sun), Dhanya(3/Jupiter), Bhramari(4/Mars),
 *   Bhadrika(5/Mercury), Ulka(6/Saturn), Siddha(7/Venus), Sankata(8/Rahu)
 *
 * The starting yogini is determined by (nakshatraIndex + 3) % 8.
 * The balance of the first dasha is based on the remaining fraction of
 * the birth nakshatra, identical in concept to Vimshottari.
 *
 * Two levels are computed: Mahadasha and Antardasha.
 *
 * @param moonLongitude  Sidereal Moon longitude (0-360).
 * @param birthDate      Date/time of birth.
 * @returns              A `YoginiDasha` object.
 */
export function calculateYoginiDasha(
  moonLongitude: number,
  birthDate: Date,
): YoginiDasha {
  const now = new Date();

  // 1. Starting yogini
  const nakshatraIdx = getNakshatraIndex(moonLongitude);
  const startYoginiIdx = getStartingYoginiIndex(nakshatraIdx);

  // 2. Balance of first dasha
  const traversed = getNakshatraTraversedFraction(moonLongitude);
  const balanceFraction = 1 - traversed;
  const firstFullYears = YOGINI_YEARS[startYoginiIdx];
  const firstBalanceYears = firstFullYears * balanceFraction;

  // 3. Build mahadasha list covering 120 years from birth
  //    (multiple 36-year cycles, cycling through all 8 yoginis)
  const TARGET_YEARS = 120;
  const yoginis: DashaPeriod[] = [];
  let cursor = new Date(birthDate.getTime());
  let accumulatedYears = 0;
  let periodCount = 0;

  while (accumulatedYears < TARGET_YEARS) {
    // The yogini index cycles: startYoginiIdx, startYoginiIdx+1, ...
    const yoginiIdx = (startYoginiIdx + periodCount) % 8;

    let durationYears: number;
    if (periodCount === 0) {
      // First mahadasha uses the balance (remaining nakshatra fraction)
      durationYears = firstBalanceYears;
    } else {
      durationYears = YOGINI_YEARS[yoginiIdx];
    }

    // Clamp to not exceed target
    if (accumulatedYears + durationYears > TARGET_YEARS) {
      durationYears = TARGET_YEARS - accumulatedYears;
    }

    const planet: Planet = YOGINI_PLANETS[yoginiIdx];
    const endDate = addYears(cursor, durationYears);
    const isActive = isDateInRange(now, cursor, endDate);

    yoginis.push({
      planet,
      startDate: new Date(cursor.getTime()),
      endDate,
      isActive,
      level: 'mahadasha',
      subPeriods: isActive
        ? buildYoginiAntardashas(yoginiIdx, cursor, durationYears, now)
        : [],
    });

    accumulatedYears += durationYears;
    cursor = endDate;
    periodCount++;
  }

  // 4. Find currently active yogini
  const currentYogini = yoginis.find((y) => y.isActive) ?? yoginis[0];

  return { yoginis, currentYogini };
}
