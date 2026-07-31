// =============================================================================
// Name Change report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access, no birth CHART
// involved (same as numerology.ts — see that module's doc comment for why).
// Wraps the already-built `computeNameAlignment`/`generateDeterministicVariants`
// from `lib/astro-engine/numerology/nameCorrection.ts`: the CURRENT name's
// full numerological signature, plus up to 5 deterministic spelling variants
// that already hit one of the alignment targets. The user never types a
// candidate name — variants are auto-generated from the existing on-file
// name (see this app's `birth_profiles`/`users.displayName`).
//
// Never throws — same defensive-fallback discipline as numerology.ts (see
// that module's doc comment for why `ctx.personName`/`ctx.personDob` are
// treated as potentially missing even though that should never happen in
// practice against real production data).
// =============================================================================

import {
  computeNameAlignment,
  generateDeterministicVariants,
  type NameAlignmentResult,
} from '../numerology/nameCorrection.js';
import { analyzePlanetStrengths } from '../gemstones.js';
import { computeLifeContext } from './report-life-context.js';
import { buildReportHeader } from './report-header.js';
import type { ReportSharedFacts } from './report-shared-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

/** Defensive-only fallbacks — see numerology.ts's module doc comment for why these should never
 * actually trigger against real production data. */
const FALLBACK_DOB = '1970-01-01';
const FALLBACK_NAME = 'Unknown';

/** How many deterministic spelling variants to surface — matches the task's own "up to 5". */
const VARIANT_COUNT = 5;

export interface NameChangeVariant {
  variant: string;
  chaldean: number;
  /** Human-readable description of the exact edit applied, e.g. `added "a" at the end` — see
   * `generateDeterministicVariants`'s own doc comment for the fixed set of edits it tries. */
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
  /** Up to 5 deterministic spelling variants that already hit one of `alignment.targets` — see
   * `generateDeterministicVariants`'s own doc comment. Can be an empty array (no candidate edit
   * happened to land on a target) — the narrative layer must say so plainly, never invent one. */
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
  const variants = generateDeterministicVariants(currentName, alignment.targets, VARIANT_COUNT);

  const analyses = analyzePlanetStrengths(ctx.chart);
  const lifeContext = computeLifeContext(ctx.chart, analyses, ctx.dashaData ?? null, new Date());
  const header = buildReportHeader(ctx.chart, ctx.personName, ctx.personDob, lifeContext);

  return {
    header,
    lifeContext,
    currentName,
    dob: dobString,
    alignment,
    variants,
  };
}
