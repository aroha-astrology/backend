// =============================================================================
// Real given-name lookups over the checked-in corpus (see ./name-corpus.ts)
// =============================================================================
// Deterministic, synchronous, no LLM call — same discipline as every other
// astro-engine module. Both baby_name and name_change use these to hand the
// LLM an already-real, already-verified candidate list instead of asking it
// to invent names outright.
// =============================================================================

import { ALL_GIVEN_NAMES, FEMALE_GIVEN_NAMES, MALE_GIVEN_NAMES } from './name-corpus.js';
import { variantHitsTarget, type NameAlignmentResult } from '../numerology/nameCorrection.js';
import {
  scoreCandidateName,
  rankScoredNames,
  type ScoredName,
} from '../numerology/name-scoring.js';

/** Every real given name starting with `syllable` (case-insensitive, exact prefix match — the
 * same convention baby_name's nakshatra table already uses for the syllable itself), shuffled so
 * a repeat generation doesn't always hand back the exact same alphabetically-first names.
 *
 * `childGender` narrows the search pool to `MALE_GIVEN_NAMES`/`FEMALE_GIVEN_NAMES` when the reader
 * stated one — matches the `childGender` report-question's own "boy"/"girl" values (see
 * frontend's report-questions.ts), not "male"/"female". Any other value (absent, or a legacy
 * "male"/"female" answer from before that question existed) searches the full corpus, same as
 * this report's existing "mixed gender in framing" default. */
export function namesStartingWith(syllable: string, limit: number, childGender?: string): string[] {
  const prefix = syllable.trim().toLowerCase();
  if (!prefix) return [];
  const pool =
    childGender === 'boy'
      ? MALE_GIVEN_NAMES
      : childGender === 'girl'
        ? FEMALE_GIVEN_NAMES
        : ALL_GIVEN_NAMES; // unisex names appear in both source lists — dedupe below
  const shuffled = shuffled_(pool);
  const seen = new Set<string>();
  const matches: string[] = [];
  for (const name of shuffled) {
    const key = name.toLowerCase();
    if (!key.startsWith(prefix) || seen.has(key)) continue;
    seen.add(key);
    matches.push(name);
    if (matches.length >= limit) break;
  }
  return matches.sort();
}

/** Fisher-Yates on a copy — cheap over a few thousand strings, run once per lookup. */
function shuffled_<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

export interface TargetHittingName {
  name: string;
  chaldean: number;
}

/** Every real given name in the corpus whose deterministically-computed Chaldean number lands on
 * one of `targets` — up to `limit`. Shuffled before truncation so a repeat run (or a repeat
 * purchase) doesn't always hand back the exact same first N alphabetically. */
export function namesHittingTarget(targets: number[], limit: number): TargetHittingName[] {
  if (targets.length === 0) return [];
  const seen = new Set<string>(); // unisex names appear in both source lists — dedupe
  const hits: TargetHittingName[] = [];
  for (const name of shuffled_(ALL_GIVEN_NAMES)) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const { chaldean, hits: isHit } = variantHitsTarget(name, targets);
    if (isHit) {
      hits.push({ name, chaldean });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

/** How many candidates to pull from the corpus before scoring+ranking down to `limit` — wide
 * enough that the score spread is meaningful, small enough to stay cheap over a few thousand
 * strings. */
const RANKING_POOL_SIZE = 120;

/**
 * The name_change report's "which suggested names are the best match" list: pulls a wide pool of
 * real corpus names hitting `a.targets` (same shuffle-then-truncate as `namesHittingTarget`, so a
 * repeat purchase still varies), scores every one against the reader's own alignment via
 * `scoreCandidateName`, ranks them, and returns the top `limit` with the top 2 flagged
 * `recommended`. Deterministic, synchronous, no LLM call.
 */
export function rankNamesForTargets(
  a: NameAlignmentResult,
  currentName: string,
  limit: number,
): ScoredName[] {
  const pool = namesHittingTarget(a.targets, RANKING_POOL_SIZE);
  const scored = pool.map((n) => scoreCandidateName(n.name, n.chaldean, currentName, a));
  return rankScoredNames(scored).slice(0, limit);
}
