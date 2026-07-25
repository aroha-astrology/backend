// =============================================================================
// Baby Name report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access. Grounds naming
// guidance in the classical Moon-nakshatra-to-starting-syllable convention.
//
// Scope note (deliberately surfaced, not hidden): this app has no separate
// "unborn child" birth-detail input, so this report grounds the naming
// guidance on the PURCHASING USER's OWN Moon nakshatra as a simplification —
// a common real convention is naming based on the CHILD's own birth chart
// instead. The narrative's opening line must say this explicitly (see
// lib/llm/reports/baby-name.ts) — an honest scope limitation, not a silent one.
// =============================================================================

import type { Nakshatra } from '@aroha-astrology/shared';
import { calculateNakshatra } from '../panchang/nakshatra.js';
import { getPlanetPosition } from './chart-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

/**
 * Standard classical Moon-nakshatra-pada -> starting-syllable table (verbatim, as specified).
 * Keyed by this codebase's own `Nakshatra` type values (camelCase, no spaces, e.g.
 * "PurvaPhalguni", "Moola") rather than the more common space-separated transliteration
 * ("Purva Phalguni", "Mula") so lookups against `calculateNakshatra(...).name` always hit —
 * the SYLLABLES themselves are unchanged from the classical table, only the key spelling is
 * adapted to match `@aroha-astrology/shared`'s `NAKSHATRAS`/`Nakshatra` type.
 *
 * Some traditions vary slightly on Swati/Purva-Ashadha/Shravana/Uttara-Bhadrapada — this is
 * the standard table, not presented as unimpeachable (see the narrative's required disclaimer).
 */
export const NAKSHATRA_PADA_SYLLABLE: Record<Nakshatra, [string, string, string, string]> = {
  Ashwini: ['Chu', 'Che', 'Cho', 'La'],
  Bharani: ['Li', 'Lu', 'Le', 'Lo'],
  Krittika: ['A', 'I', 'U', 'E'],
  Rohini: ['O', 'Va', 'Vi', 'Vu'],
  Mrigashira: ['Ve', 'Vo', 'Ka', 'Ki'],
  Ardra: ['Ku', 'Gha', 'Nga', 'Chha'],
  Punarvasu: ['Ke', 'Ko', 'Ha', 'Hi'],
  Pushya: ['Hu', 'He', 'Ho', 'Da'],
  Ashlesha: ['Di', 'Du', 'De', 'Do'],
  Magha: ['Ma', 'Mi', 'Mu', 'Me'],
  PurvaPhalguni: ['Mo', 'Ta', 'Ti', 'Tu'],
  UttaraPhalguni: ['Te', 'To', 'Pa', 'Pi'],
  Hasta: ['Pu', 'Sha', 'Na', 'Tha'],
  Chitra: ['Pe', 'Po', 'Ra', 'Ri'],
  Swati: ['Ru', 'Re', 'Ro', 'Ta'],
  Vishakha: ['Ti', 'Tu', 'Te', 'To'],
  Anuradha: ['Na', 'Ni', 'Nu', 'Ne'],
  Jyeshtha: ['No', 'Ya', 'Yi', 'Yu'],
  Moola: ['Ye', 'Yo', 'Ba', 'Bi'],
  PurvaAshadha: ['Bhu', 'Dha', 'Bha', 'Dha'],
  UttaraAshadha: ['Bhe', 'Bho', 'Ja', 'Ji'],
  Shravana: ['Ju', 'Je', 'Jo', 'Gha'],
  Dhanishta: ['Ga', 'Gi', 'Gu', 'Ge'],
  Shatabhisha: ['Go', 'Sa', 'Si', 'Su'],
  PurvaBhadrapada: ['Se', 'So', 'Da', 'Di'],
  UttaraBhadrapada: ['Du', 'Tha', 'Jha', 'Da'],
  Revati: ['De', 'Do', 'Cha', 'Chi'],
};

export interface BabyNameScores extends Record<string, unknown> {
  moonNakshatra: Nakshatra;
  moonPada: number;
  /** The single starting syllable for this exact nakshatra+pada (an array for interface
   * consistency/future extension, but always exactly 1 entry today). */
  startingSyllables: string[];
}

export function computeBabyNameScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
): BabyNameScores {
  const chart = ctx.chart;
  const moon = getPlanetPosition('Moon', chart);
  // Falls back to longitude 0 (Ashwini, pada 1) when the chart has no Moon data — same
  // defensive-fallback spirit as kundli-milan's getMoonPlacement.
  const longitude = typeof moon?.longitude === 'number' ? moon.longitude : 0;

  const nakshatraData = calculateNakshatra(longitude);
  const syllables = NAKSHATRA_PADA_SYLLABLE[nakshatraData.name];
  const startingSyllables = syllables ? [syllables[nakshatraData.pada - 1] as string] : [];

  return {
    moonNakshatra: nakshatraData.name,
    moonPada: nakshatraData.pada,
    startingSyllables,
  };
}
