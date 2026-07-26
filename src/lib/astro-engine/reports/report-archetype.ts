// =============================================================================
// Report archetype + trait-tilt — shared "sign temperament + 5 named traits"
// primitive for report narratives
// =============================================================================
// `SIGN_TEMPERAMENT` below was originally private to marriage.ts (the
// Marriage report's 7th-house-sign temperament sketch). It's moved here,
// unchanged, because every other report type that wants a similar "sign ->
// temperament flavor" sentence (career's 10th house, wealth's 2nd house,
// etc.) should read the SAME classical lookup table rather than each report
// re-authoring its own copy that could drift out of sync in tone or wording.
// marriage.ts now imports it from here — see that file's own import.
// =============================================================================

import type { PlanetAnalysis } from '../gemstones.js';
import { strengthScoreOfPlanet } from './chart-facts.js';

/**
 * Classical sign-quality lore, one line per zodiac sign — deliberately generic
 * (not fabricated specificity about a real person's life). Originally
 * authored in marriage.ts for its 7th-house-sign temperament sketch; moved
 * here verbatim so every report type can share it. See
 * `report-marriage-scores.spec.ts` / marriage.ts's own doc comment for the
 * "classical lore, not fabricated specificity" discipline this table follows.
 */
export const SIGN_TEMPERAMENT: Record<string, string> = {
  Aries: 'direct, driven, and quick to commit once decided',
  Taurus: 'steady, sensual, and loyal once trust is earned',
  Gemini: 'curious, communicative, and drawn to a mentally stimulating partner',
  Cancer: 'nurturing, emotionally deep, and protective of home and family',
  Leo: 'warm, generous, and drawn to a partner who admires them openly',
  Virgo: 'thoughtful, practical, and devoted through acts of service',
  Libra: 'harmony-seeking, charming, and genuinely partnership-oriented',
  Scorpio: 'intense, deeply loyal, and drawn to emotional and physical depth',
  Sagittarius: 'freedom-loving, optimistic, and needs a partner who shares their outlook',
  Capricorn: 'committed, ambitious, and serious about long-term responsibility',
  Aquarius: 'independent, unconventional, and values friendship within partnership',
  Pisces: 'romantic, empathetic, and drawn to a soulful emotional connection',
};

/** Fallback line when a sign IS known but happens not to be a key in `SIGN_TEMPERAMENT`
 * (defensive only — all 12 real zodiac sign names are covered above). */
const UNKNOWN_SIGN_TEMPERAMENT = "a distinct temperament shaped by this house's sign";

export interface TraitTilt {
  label: string;
  /** 0-10. See `computeArchetype`'s doc comment for the exact scaling formula. */
  score: number;
}

export interface Archetype {
  /** A short, generic archetype NAME (not a real-person claim), e.g. "The Quiet Strategist". */
  label: string;
  /** 1 sentence, built from the relevant house sign's `SIGN_TEMPERAMENT` entry. */
  description: string;
  /** Exactly 5 entries, in the order the caller supplied `traitLabels`/`traitSignificators`. */
  traits: TraitTilt[];
}

/** One sentence combining the house sign and its classical temperament lore — shared by
 * `computeArchetype` below; kept as its own function so the exact wording is defined once. */
function describeTemperament(houseSign: string | undefined): string {
  if (!houseSign) {
    return 'This placement carries a distinct temperament shaped by a chart placement whose sign is unavailable.';
  }
  const temperament = SIGN_TEMPERAMENT[houseSign] ?? UNKNOWN_SIGN_TEMPERAMENT;
  return `Classically, this placement's sign (${houseSign}) suggests someone ${temperament}.`;
}

/**
 * Builds a small "archetype" summary — a short generic name, a one-sentence classical
 * temperament description, and a 0-10 tilt score for exactly 5 named traits — from a house's
 * sign plus 5 planets whose computed natal strength backs each trait.
 *
 * Scaling formula: each trait's score is `strengthScoreOfPlanet(significator, analyses) / 10`.
 * `strengthScoreOfPlanet` (chart-facts.ts) already maps weak/average/strong to 30/60/90 (see
 * `STRENGTH_SCORE`), so dividing by 10 lands the score in a clean 0-10 range: weak = 3,
 * average = 6, strong = 9 — the same relative spacing as the underlying 30/60/90 scale, just
 * rescaled for a "tilt out of 10" narrative framing instead of a "score out of 100" one.
 *
 * @param houseSign            The zodiac sign of whichever house this archetype is themed
 *                             around (e.g. the 7th house sign for a marriage archetype, the
 *                             10th house sign for a career archetype). Undefined if that
 *                             house's sign is unavailable on the chart — degrades to a generic
 *                             description rather than throwing.
 * @param archetypeLabel       The archetype's display name. The caller (a later phase, not this
 *                             one) decides the naming convention per domain/report type — this
 *                             function only threads it through into the returned `Archetype`.
 * @param traitLabels          Exactly 5 trait names, in display order (e.g. marriage:
 *                             ['Warmth', 'Discipline', 'Intellect', 'Sensuality', 'Ambition']).
 * @param traitSignificators   Exactly 5 planet names, ORDER-MATCHED to `traitLabels` — i.e.
 *                             `traitSignificators[i]`'s natal strength backs `traitLabels[i]`.
 * @param analyses             `analyzePlanetStrengths(chart)`'s result — the natal
 *                             weak/average/strong classification for all 9 planets.
 */
export function computeArchetype(
  houseSign: string | undefined,
  archetypeLabel: string,
  traitLabels: [string, string, string, string, string],
  traitSignificators: [string, string, string, string, string],
  analyses: PlanetAnalysis[],
): Archetype {
  const traits: TraitTilt[] = traitLabels.map((label, i) => ({
    label,
    // Non-null assertion: `i` ranges over 0-4 (mapping a 5-tuple), so `traitSignificators[i]`
    // is always defined by construction — `noUncheckedIndexedAccess` just can't see that a
    // fixed-length tuple indexed by a loop variable is always in-bounds.
    score: strengthScoreOfPlanet(traitSignificators[i]!, analyses) / 10,
  }));

  return {
    label: archetypeLabel,
    description: describeTemperament(houseSign),
    traits,
  };
}
