// =============================================================================
// Nakshatra Calculation from Moon Longitude
// =============================================================================
// Nakshatra index = floor(Moon longitude / 13°20')
// Each nakshatra spans 13°20' (13.3333... degrees).

import type { NakshatraData } from '@aroha-astrology/shared';
import { NAKSHATRAS, NAKSHATRA_LORDS, NAKSHATRA_SPAN } from '@aroha-astrology/shared';

const NAKSHATRA_DEITIES: string[] = [
  'Ashwini Kumaras', 'Yama', 'Agni', 'Brahma', 'Soma',
  'Rudra', 'Aditi', 'Brihaspati', 'Sarpa', 'Pitru',
  'Bhaga', 'Aryaman', 'Savitar', 'Tvashtar', 'Vayu',
  'Indra-Agni', 'Mitra', 'Indra', 'Nirriti', 'Apah',
  'Vishvadeva', 'Vishnu', 'Vasu', 'Varuna', 'Aja Ekapada',
  'Ahir Budhnya', 'Pushan',
];

/**
 * Calculate the nakshatra from the Moon's sidereal longitude.
 *
 * @param moonLong - Sidereal longitude of the Moon (0-360)
 * @returns NakshatraData with index, name, lord, pada, and deity
 */
export function calculateNakshatra(moonLong: number): NakshatraData {
  // Normalize to 0-360
  let normalizedLong = moonLong % 360;
  if (normalizedLong < 0) normalizedLong += 360;

  // Each nakshatra = 13°20' = 13.33333... degrees
  const nakshatraIndex = Math.floor(normalizedLong / NAKSHATRA_SPAN);
  const clampedIndex = Math.min(nakshatraIndex, 26);

  // Calculate pada (quarter) within the nakshatra
  const posInNakshatra = normalizedLong - clampedIndex * NAKSHATRA_SPAN;
  const padaSpan = NAKSHATRA_SPAN / 4; // 3°20' = 3.3333... degrees
  const pada = Math.min(Math.floor(posInNakshatra / padaSpan) + 1, 4);

  return {
    index: clampedIndex,
    name: NAKSHATRAS[clampedIndex],
    lord: NAKSHATRA_LORDS[clampedIndex],
    pada,
    deity: NAKSHATRA_DEITIES[clampedIndex],
  };
}
