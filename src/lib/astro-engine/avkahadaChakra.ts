// =============================================================================
// Avkahada Chakra — a traditional Vedic "birth summary chart" combining
// Varna, Vashya, Yoni, Gana, Nadi (all reused from the proven Ashtakoota
// engine — see matching/ashtakoota.ts, now exporting `getVarnaRank` and
// `VASHYA_GROUP` as standalone per-person classifications rather than only
// pairwise comparisons; the Yoni/Gana/Nadi nakshatra tables were already
// public via @aroha-astrology/shared, which ashtakoota.ts itself imports
// them from, so they're sourced directly from there below), Paya, and the
// required naming syllable (babyNameSyllables.ts, Batch 5).
//
// Paya sourcing note: uses the Moon's-house-from-Ascendant method (1st/6th/
// 11th = Gold, 2nd/5th/9th = Silver, 3rd/7th/10th = Copper, 4th/8th/12th =
// Iron) rather than the alternate nakshatra-based method, because the
// nakshatra method's public documentation only covers 5 of 27 nakshatras
// (Iron-paya ones) — the house-based method is complete, unambiguous, and
// verified via live web search before this plan was written.
// =============================================================================

import type { ZodiacSign } from '@aroha-astrology/shared';
import { NAKSHATRA_GANA, NAKSHATRA_YONI, NAKSHATRA_NADI } from '@aroha-astrology/shared';
import { getVarnaRank, VASHYA_GROUP } from './matching/ashtakoota.js';
import { getNamingSyllable } from './babyNameSyllables.js';

export interface AvkahadaChakra {
  varna: string;
  vashya: string;
  yoni: string;
  gana: string;
  nadi: string;
  paya: 'Gold' | 'Silver' | 'Copper' | 'Iron';
  namingSyllable: string;
  moonSign: string;
  moonNakshatra: string;
}

/**
 * Varna CATEGORY NAME by rank. ashtakoota.ts's `getVarnaRank` only produces
 * the numeric rank it needs for its own boy>=girl Koota comparison — no
 * name-level table exists there, so this small lookup is added here (not
 * exported from ashtakoota.ts, since nothing there needs the name form).
 * Ranks per getVarnaRank's own element mapping: Fire=Kshatriya(2),
 * Earth=Vaishya(1), Air=Shudra(0), Water=Brahmin(3).
 */
const VARNA_NAME_BY_RANK: Record<number, string> = {
  0: 'Shudra',
  1: 'Vaishya',
  2: 'Kshatriya',
  3: 'Brahmin',
};

/** Moon's house-from-Ascendant -> Paya, per the verified house-based method. */
function getPaya(moonHouseFromAscendant: number): 'Gold' | 'Silver' | 'Copper' | 'Iron' {
  if ([1, 6, 11].includes(moonHouseFromAscendant)) return 'Gold';
  if ([2, 5, 9].includes(moonHouseFromAscendant)) return 'Silver';
  if ([3, 7, 10].includes(moonHouseFromAscendant)) return 'Copper';
  return 'Iron'; // 4, 8, 12
}

/**
 * Assembles the Avkahada Chakra from an already-stored kundli.chartData.
 * Naming-syllable is purely informational here (distinct from the paid Baby
 * Name report), and uses the Moon's REAL nakshatra pada when the chart has
 * it (the same `nakshatraPada` field chat-grounding.ts's PlanetFact reads),
 * falling back to pada 1 only when it's genuinely absent/out of range.
 */
export function computeAvkahadaChakra(
  chart: Record<string, unknown> | null,
): AvkahadaChakra | null {
  const planets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  const moon = planets.find((p) => p.planet === 'Moon');
  if (!moon || moon.longitude == null || moon.house == null || moon.sign == null) return null;

  const moonSign = String(moon.sign) as ZodiacSign;
  const moonHouse = Number(moon.house);

  // Prefer the chart's own precomputed nakshatraIndex (the established
  // pattern this codebase already uses, e.g. compatibility.ts's
  // `Number(moon?.nakshatraIndex ?? 0)`), falling back to deriving it from
  // longitude only when that field is genuinely missing.
  const nakshatraIndex =
    moon.nakshatraIndex != null
      ? ((Number(moon.nakshatraIndex) % 27) + 27) % 27
      : ((Math.floor(Number(moon.longitude) / (360 / 27)) % 27) + 27) % 27;

  const rawPada = Number(moon.nakshatraPada);
  const pada = rawPada >= 1 && rawPada <= 4 ? rawPada : 1;

  const varnaRank = getVarnaRank(moonSign);

  return {
    varna: VARNA_NAME_BY_RANK[varnaRank] ?? '',
    vashya: VASHYA_GROUP[moonSign] ?? '',
    yoni: NAKSHATRA_YONI[nakshatraIndex]?.animal ?? '',
    gana: NAKSHATRA_GANA[nakshatraIndex] ?? '',
    nadi: NAKSHATRA_NADI[nakshatraIndex] ?? '',
    paya: getPaya(moonHouse),
    namingSyllable: getNamingSyllable(nakshatraIndex, pada),
    moonSign,
    moonNakshatra: String(moon.nakshatra ?? ''),
  };
}
