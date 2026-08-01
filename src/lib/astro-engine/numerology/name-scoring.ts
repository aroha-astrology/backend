// =============================================================================
// Name Change report — deterministic candidate scoring
// =============================================================================
// Ranks a candidate name against the reader's own NameAlignmentResult so the
// name_change report can show "first choice is this much of a match, second
// is this much" instead of an unordered wall of names. Score is
// base + signal deltas, clamped to [40, 99] — same discipline as this app's
// gemstone suitability scoring (see astro-engine/gemstones.ts): nothing
// should ever read as a "perfect" or "worthless" match. `reasons` are given
// facts the LLM narrative must be grounded in, never invented — same
// GROUNDING_RULE contract llm/reports/name-change.ts already enforces for
// every other number in this report.
// =============================================================================

import type { NameAlignmentResult } from './nameCorrection.js';

export interface ScoredName {
  name: string;
  chaldean: number;
  /** Clamped [40, 99] — see module doc comment for why. */
  score: number;
  /** Deterministic, user-readable justification for the score — grounds the LLM's bullets. */
  reasons: string[];
  /** Top 2 by score are flagged — the report's "Best Match" pill. */
  recommended: boolean;
}

const BASE_SCORE = 55;
const MIN_SCORE = 40;
const MAX_SCORE = 99;

/** Score one candidate name against the reader's own alignment result. Pure, synchronous. */
export function scoreCandidateName(
  candidate: string,
  chaldean: number,
  currentName: string,
  a: NameAlignmentResult,
): ScoredName {
  let score = BASE_SCORE;
  const reasons: string[] = [];

  if (chaldean === a.targets[0]) {
    score += 25;
    reasons.push(`Lands exactly on your destiny number ${a.targets[0]}`);
  } else if (chaldean === a.targets[1]) {
    score += 15;
    reasons.push(`Matches your psychic number ${a.targets[1]}`);
  } else if (a.targets.includes(chaldean)) {
    score += 8;
    reasons.push('Reaches one of your target numbers');
  }

  if (a.friendly.includes(chaldean)) {
    score += 8;
    reasons.push('Sits in a friendly number group for you');
  }

  const currentTrimmed = currentName.trim();
  if (currentTrimmed && candidate[0]?.toLowerCase() === currentTrimmed[0]?.toLowerCase()) {
    score += 6;
    reasons.push('Keeps your initial — easy to phase in');
  }

  if (currentTrimmed && Math.abs(candidate.length - currentTrimmed.length) <= 2) {
    score += 4;
    reasons.push('Close in length to the name you use today');
  }

  if (a.enemy.includes(chaldean)) {
    score -= 10;
    reasons.push(`One classical caution: also touches enemy number ${chaldean}`);
  }

  return {
    name: candidate,
    chaldean,
    score: Math.min(MAX_SCORE, Math.max(MIN_SCORE, score)),
    reasons,
    recommended: false,
  };
}

/** Sorts by score desc (ties broken by name for stable output), flags the top 2 `recommended`. */
export function rankScoredNames(scored: ScoredName[]): ScoredName[] {
  const ranked = [...scored].sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
  for (let i = 0; i < Math.min(2, ranked.length); i++) {
    ranked[i] = { ...ranked[i]!, recommended: true };
  }
  return ranked;
}
