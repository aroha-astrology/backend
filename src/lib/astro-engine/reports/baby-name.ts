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
import { analyzePlanetStrengths } from '../gemstones.js';
import { computeDoshaYogaSummary, type DoshaYogaSummary } from './report-dosha-yoga-summary.js';
import { computeLifeContext } from './report-life-context.js';
import { buildReportHeader } from './report-header.js';
import { computeReportVargas } from './report-vargas.js';
import { namesStartingWith } from '../names/name-lookup.js';
import type { ReportSharedFacts } from './report-shared-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

/** How many real candidate names to hand the narrative layer — see `NAMES_RULE` in
 * lib/llm/reports/baby-name.ts for why 25 is the report's own target. */
const CANDIDATE_NAME_COUNT = 25;

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

export interface BabyNameScores extends Record<string, unknown>, ReportSharedFacts {
  moonNakshatra: Nakshatra;
  moonPada: number;
  /** The single starting syllable for this exact nakshatra+pada (an array for interface
   * consistency/future extension, but always exactly 1 entry today). */
  startingSyllables: string[];
  /** `calculateNakshatra(...).lord` — the nakshatra's ruling planet — surfaced as naming-theme
   * flavor for the narrative (e.g. the lord's classical qualities). `NakshatraData.lord` is
   * always populated for a valid nakshatra index today, but typed optional here defensively
   * rather than assuming that never changes. */
  nakshatraLord: string | undefined;
  /** `calculateNakshatra(...).deity` — the nakshatra's presiding deity — surfaced as naming-theme
   * flavor for the narrative. Same defensive-optional reasoning as `nakshatraLord`. */
  nakshatraDeity: string | undefined;
  /** Mangal Dosha / Kaal Sarp Dosha cautions and Raja/Dhana Yoga positives read from the BABY's
   * OWN chart (ctx.doshaData/ctx.yogaData describe the baby here, not the purchasing parent —
   * see this module's own top-of-file scope note). Framed gently in the narrative — see
   * lib/llm/reports/baby-name.ts's GENTLE_DOSHA_RULE — this report is read by a new parent. */
  doshaYoga: DoshaYogaSummary;
  /** Real given names (see lib/astro-engine/names/name-corpus.ts) starting with
   * `startingSyllables[0]`, up to CANDIDATE_NAME_COUNT — GIVEN FACTS the narrative writes about,
   * never a list the LLM is asked to invent. Gender-narrowed when `ctx.userAnswers.childGender`
   * was given. Can be shorter than CANDIDATE_NAME_COUNT (rarely empty) for an uncommon syllable —
   * the narrative layer states the real count rather than padding it. */
  candidateNames: string[];
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

  // ctx.doshaData/ctx.yogaData describe the BABY's own chart here (see this module's top-of-file
  // scope note) — a Mangal/Kaal Sarp caution or Raja/Dhana Yoga positive on a baby's chart is
  // on-theme for a naming report and framed gently by the narrative layer.
  const doshaYoga = computeDoshaYogaSummary(
    ctx.doshaData ?? null,
    ctx.yogaData ?? null,
    ['mangal', 'kaalSarp'],
    ['raja', 'dhana'],
  );

  const analyses = analyzePlanetStrengths(chart);
  const lifeContext = computeLifeContext(chart, analyses, ctx.dashaData ?? null, new Date());
  const header = buildReportHeader(chart, ctx.personName, ctx.personDob, lifeContext);

  const candidateNames = startingSyllables[0]
    ? namesStartingWith(startingSyllables[0], CANDIDATE_NAME_COUNT, ctx.userAnswers?.childGender)
    : [];

  // Saptamsha (D7) — the classical children/progeny/creative-output chart, the natural varga for
  // a naming report (this report reads the BABY's own chart — see this module's top-of-file scope
  // note — so this is the baby's own D7, not a progeny-house derivation from a parent's chart).
  const vargas = computeReportVargas(chart, ['D7']);

  return {
    header,
    lifeContext,
    vargas,
    userAnswers: ctx.userAnswers ?? null,
    moonNakshatra: nakshatraData.name,
    moonPada: nakshatraData.pada,
    startingSyllables,
    nakshatraLord: nakshatraData.lord,
    nakshatraDeity: nakshatraData.deity,
    doshaYoga,
    candidateNames,
  };
}
