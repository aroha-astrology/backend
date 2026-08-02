// =============================================================================
// Name Change report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access, no birth CHART
// involved (same as numerology.ts — see that module's doc comment for why).
// Wraps `computeNameAlignment` (numerology/nameCorrection.ts) plus
// `generateSpellingVariants` (names/name-variants.ts): the CURRENT name's full
// numerological signature, plus up to 12 deterministic spelling variants that
// already hit one of the alignment targets, at least half of them confined to
// the reader's FIRST name. The user never types a candidate name — variants are
// auto-generated from the existing on-file name (see this app's
// `birth_profiles`/`users.displayName`).
//
// Spelling variants are this report's main event; the small ranked list of
// alternative FIRST names (surname kept) is the 20% footnote, built later in
// the narrative layer from `rankNamesForTargets`.
//
// Never throws — same defensive-fallback discipline as numerology.ts (see
// that module's doc comment for why `ctx.personName`/`ctx.personDob` are
// treated as potentially missing even though that should never happen in
// practice against real production data).
// =============================================================================

import { computeNameAlignment, type NameAlignmentResult } from '../numerology/nameCorrection.js';
import { generateSpellingVariants } from '../names/name-variants.js';
import { analyzePlanetStrengths } from '../gemstones.js';
import { computeLifeContext } from './report-life-context.js';
import { buildReportHeader } from './report-header.js';
import type { ReportSharedFacts } from './report-shared-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

/** Defensive-only fallbacks — see numerology.ts's module doc comment for why these should never
 * actually trigger against real production data. */
const FALLBACK_DOB = '1970-01-01';
const FALLBACK_NAME = 'Unknown';

/**
 * How many deterministic spelling variants to surface. This report is 80% spelling adjustments /
 * 20% alternative first names, and the narrative layer derives its suggested-name count from what
 * this actually returns (see SUGGESTION_COUNT in llm/reports/name-change.ts) — so 12 here means
 * ~3 suggested names and ~15 cards total, the same LLM load the old 5-variant/10-name split had.
 */
const VARIANT_COUNT = 12;

export interface NameChangeVariant {
  variant: string;
  chaldean: number;
  /** Human-readable description of the exact edit applied, e.g. `first name — replaced "i" with
   * "ee"` — see `generateSpellingVariants`'s own doc comment for the edits it tries. */
  change: string;
}

export interface NameChangeScores extends Record<string, unknown>, ReportSharedFacts {
  /** The name actually used — `ctx.personName`, or FALLBACK_NAME on the defensive path (see
   * numerology.ts's module doc comment for why this fallback should never trigger in practice). */
  currentName: string;
  /** The DOB actually used ('YYYY-MM-DD') — same fallback reasoning as `currentName`. */
  dob: string;
  /** Full numerological signature of `currentName` — mulank, bhagyank, pythagorean, chaldean,
   * soulUrge, personality, target numbers, alignment classification, friendly/enemy numbers. */
  alignment: NameAlignmentResult;
  /**
   * The reader's own gender, straight off `ctx.personGender`, narrowed to the binary the name
   * corpus is split on. Drives which corpus slice the narrative layer's alternative-first-name
   * list is drawn from (`rankNamesForTargets`) — a man must never be handed a female-coded name.
   * `'other'`/missing stays `null` (search the full corpus): unlike numerology's Kua formula
   * there's no classical reason to force a binary here, so we don't guess.
   */
  gender: 'male' | 'female' | null;
  /** Up to 12 deterministic spelling variants that already hit one of `alignment.targets`, at
   * least half confined to the first name — see `generateSpellingVariants`. Can be an empty array
   * (no candidate edit landed on a target) — the narrative layer must say so plainly, never
   * invent one. */
  variants: NameChangeVariant[];
}

function resolveName(ctx: ReportScoreContext): string {
  const trimmed = ctx.personName?.trim();
  return trimmed ? trimmed : FALLBACK_NAME;
}

function resolveDob(ctx: ReportScoreContext): { dobString: string; dob: Date } {
  if (ctx.personDob) {
    const parsed = new Date(ctx.personDob);
    if (!Number.isNaN(parsed.getTime())) {
      return { dobString: ctx.personDob, dob: parsed };
    }
  }
  return { dobString: FALLBACK_DOB, dob: new Date(FALLBACK_DOB) };
}

export function computeNameChangeScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
): NameChangeScores {
  const currentName = resolveName(ctx);
  const { dobString, dob } = resolveDob(ctx);

  const alignment = computeNameAlignment(currentName, dob);
  const variants = generateSpellingVariants(currentName, alignment.targets, VARIANT_COUNT);

  const analyses = analyzePlanetStrengths(ctx.chart);
  const lifeContext = computeLifeContext(ctx.chart, analyses, ctx.dashaData ?? null, new Date());
  const header = buildReportHeader(ctx.chart, ctx.personName, ctx.personDob, lifeContext);

  return {
    header,
    lifeContext,
    currentName,
    dob: dobString,
    gender: ctx.personGender === 'male' || ctx.personGender === 'female' ? ctx.personGender : null,
    alignment,
    variants,
  };
}
