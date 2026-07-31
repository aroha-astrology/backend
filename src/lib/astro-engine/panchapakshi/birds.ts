// =============================================================================
// Pancha Pakshi Shastra — birth bird assignment
// =============================================================================
// Assigns one of the 5 elemental birds (Vulture, Owl, Crow, Cock, Peacock) to
// a birth nakshatra + Paksha, per the classical grouping of the 27 nakshatras
// into 5 bands. Verified against an independent source (astrogiva.com's
// Panch Pakshi reference table) rather than reconstructed from memory alone —
// see PANCHA_PAKSHI_GROUPS below for the exact band boundaries.
//
// SCOPE NOTE: only the bird-assignment half of Pancha Pakshi Shastra is
// implemented (this file + yamas.ts's time-window math). The system's other
// half — which of the 5 activities (Ruling/Eating/Walking/Sleeping/Dying)
// each bird performs during each of the 10 daily Yamas, which varies by
// weekday and Paksha — requires a complete reference table that could not be
// verified with confidence from the sources available (multiple sources
// checked were fragmentary or internally inconsistent with each other).
// Shipping a guessed activity table risks telling a user their bird is
// "Ruling" (act boldly) when it's actually "Dying" (avoid all important
// tasks) — precisely the wrong direction to be wrong in for a timing system.
// Per this codebase's own established convention for exactly this situation
// (see astro-engine/charts/jaiminiPoints.ts's near-identical Varshaphala
// disclaimer), that piece is deliberately NOT implemented here rather than
// fabricated. This is a real, addressable gap: get the activity table from
// a verified reference (a purchased primary source, e.g. one of the
// specialist Pancha Pakshi books already in circulation) and it plugs
// straight into the Yama windows yamas.ts already computes correctly.
// =============================================================================

import { NAKSHATRAS } from '@aroha-astrology/shared';

export type PakshiBird = 'Vulture' | 'Owl' | 'Crow' | 'Cock' | 'Peacock';
export type Paksha = 'Shukla' | 'Krishna';

/**
 * The 27 nakshatras grouped into 5 bands (Ashwini=index 0 .. Revati=index 26,
 * matching @aroha-astrology/shared's NAKSHATRAS ordering). Band sizes are
 * 5,6,5,5,6 — not evenly split — per the classical grouping.
 */
export const PANCHA_PAKSHI_GROUPS: readonly { start: number; end: number }[] = [
  { start: 0, end: 4 }, // Ashwini..Mrigashira
  { start: 5, end: 10 }, // Ardra..PurvaPhalguni
  { start: 11, end: 15 }, // UttaraPhalguni..Vishakha
  { start: 16, end: 20 }, // Anuradha..UttaraAshadha
  { start: 21, end: 26 }, // Shravana..Revati
];

/**
 * Shukla Paksha (waxing/bright half) band -> bird. Krishna Paksha (waning/
 * dark half) uses the reverse order for bands 0/1/3/4 — band 2 (Crow) is
 * invariant across both Pakshas, per the source table.
 */
const SHUKLA_BIRDS: readonly PakshiBird[] = ['Vulture', 'Owl', 'Crow', 'Cock', 'Peacock'];
const KRISHNA_BIRDS: readonly PakshiBird[] = ['Peacock', 'Cock', 'Crow', 'Owl', 'Vulture'];

/**
 * Determine the birth bird from natal Moon nakshatra index (0-26) and the
 * Paksha (lunar fortnight) at birth.
 */
export function getBirthBird(nakshatraIndex: number, paksha: Paksha): PakshiBird {
  const groupIndex = PANCHA_PAKSHI_GROUPS.findIndex(
    (g) => nakshatraIndex >= g.start && nakshatraIndex <= g.end,
  );
  const birds = paksha === 'Shukla' ? SHUKLA_BIRDS : KRISHNA_BIRDS;
  return birds[groupIndex] ?? 'Crow';
}

export interface BirthBirdResult {
  bird: PakshiBird;
  nakshatra: string;
  paksha: Paksha;
}

/** Paksha at birth from the natal tithi number (1-15 Shukla, 16-30 Krishna) — matches panchang/tithi.ts's convention. */
export function pakshaFromTithiNumber(tithiNumber: number): Paksha {
  return tithiNumber <= 15 ? 'Shukla' : 'Krishna';
}

export function computeBirthBird(nakshatraIndex: number, tithiNumber: number): BirthBirdResult {
  const paksha = pakshaFromTithiNumber(tithiNumber);
  return {
    bird: getBirthBird(nakshatraIndex, paksha),
    nakshatra: NAKSHATRAS[nakshatraIndex] ?? 'Unknown',
    paksha,
  };
}
