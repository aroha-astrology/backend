// =============================================================================
// KP (Krishnamurti Paddhati) sub-lord computation. Each nakshatra (13°20') is
// divided into 9 sub-lord segments, starting from the nakshatra's OWN ruling
// lord and cycling through the fixed Vimshottari dasha order from there, each
// segment's arc proportional to that planet's Vimshottari dasha years (out of
// 120) — the standard KP sub-lord formula, cross-verified against public
// KP-astrology references before this was written (see the plan doc).
// =============================================================================

import {
  NAKSHATRA_LORDS,
  NAKSHATRA_SPAN,
  VIMSHOTTARI_ORDER,
  VIMSHOTTARI_YEARS,
  VIMSHOTTARI_TOTAL_YEARS,
  type Planet,
} from '@aroha-astrology/shared';

/** Returns the KP sub-lord for a given sidereal longitude (0-360°). */
export function getSubLord(longitude: number): Planet {
  // Only wrap negative inputs up into [0, 360). Unconditionally doing
  // `(x + 360) % 360` (even for already-in-range x) round-trips the value
  // through a larger magnitude and back, which loses trailing-digit
  // precision in floating point (e.g. 13.333333333333334 -> 373.33333333333337
  // -> 13.333333333333314) — enough to misclassify a longitude sitting
  // exactly on a nakshatra boundary. Real ephemeris longitudes are always
  // non-negative already, so this only changes behavior for the (rare)
  // negative-input path, which still normalizes correctly.
  let normalizedLon = longitude % 360;
  if (normalizedLon < 0) normalizedLon += 360;
  const nakshatraIndex = Math.floor(normalizedLon / NAKSHATRA_SPAN) % 27;
  const degreeWithinNakshatra = normalizedLon % NAKSHATRA_SPAN;
  const nakshatraLord = NAKSHATRA_LORDS[nakshatraIndex]!;
  const startIdx = VIMSHOTTARI_ORDER.indexOf(nakshatraLord);
  const targetYears = (degreeWithinNakshatra / NAKSHATRA_SPAN) * VIMSHOTTARI_TOTAL_YEARS;

  let cumulative = 0;
  for (let i = 0; i < 9; i++) {
    const planet = VIMSHOTTARI_ORDER[(startIdx + i) % 9]!;
    cumulative += VIMSHOTTARI_YEARS[planet];
    if (targetYears < cumulative) return planet;
  }
  return VIMSHOTTARI_ORDER[startIdx]!; // unreachable: targetYears is always < 120
}

export interface KpSignificator {
  /** 'Ascendant' or a planet name. */
  name: string;
  sign: string;
  subLord: Planet;
}

/**
 * Computes the KP sub-lord for the Ascendant + all 9 planets from an
 * already-stored kundli.chartData. Entries with missing longitude data are
 * silently skipped (not thrown) — a partial result is still useful; the
 * caller (kp-report.ts) requires only a non-empty list.
 */
export function computeKpSignificators(chart: Record<string, unknown> | null): KpSignificator[] {
  const results: KpSignificator[] = [];

  const ascendant = chart?.ascendant as Record<string, unknown> | undefined;
  if (ascendant?.longitude != null) {
    results.push({
      name: 'Ascendant',
      sign: String(ascendant.sign ?? ''),
      subLord: getSubLord(Number(ascendant.longitude)),
    });
  }

  const planets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  for (const p of planets) {
    if (p.planet == null || p.longitude == null) continue;
    results.push({
      name: String(p.planet),
      sign: String(p.sign ?? ''),
      subLord: getSubLord(Number(p.longitude)),
    });
  }

  return results;
}
