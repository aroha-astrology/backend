// =============================================================================
// Phone Number Numerology
// =============================================================================
// Deterministic, synchronous, no LLM call — same discipline as every other
// astro-engine module (see chaldean.ts/vedic.ts/nameCorrection.ts). Judges a
// 10-digit mobile number's numerological "vibration" against its holder's
// Mulank (day-to-day) and Bhagyank (destiny), using the SAME friendly/enemy
// tables name-correction's target-picker uses (see number-compatibility.ts) —
// the phone panel can never disagree with the name panel about which numbers
// are friendly to a given Mulank/Bhagyank.
//
// This encodes ONE classical school of phone numerology. Sources disagree
// with each other on several specifics (e.g. whether a total of 6/8 is
// unlucky, or whether 5 is universally the "best" digit) — this module
// commits to: (1) the SAME friendly/enemy tables as name correction, weighted
// toward Mulank since a phone is a daily-use object; (2) zeros read as delay/
// obstruction and a trailing zero is worst, which is the one point every
// source consulted agreed on; (3) a documented favorable/unfavorable digit-
// pair list. See llm/reports/numerology.ts's phone section for the sources.
// =============================================================================

import { calculateMulank, calculateBhagyank, reduceToSingleDigit } from './vedic';
import { FRIENDLY_MAP, ENEMY_MAP } from './number-compatibility';

export type MobileVerdict = 'powerful' | 'supportive' | 'neutral' | 'draining';

/** One classically-favorable or classically-unfavorable two-digit consecutive pair — the 9
 * overlapping pairs in a 10-digit number (positions 0-1, 1-2, ..., 8-9). */
export interface DigitPairFinding {
  pair: string; // e.g. "26"
  favorable: boolean;
}

export interface MobileNumberAnalysis {
  /** MASKED — e.g. "98••••3210" (first 2 + last 4 real, middle redacted). This module never
   * returns the full number; see computeMobileNumberScores's own doc comment for why. */
  maskedNumber: string;
  total: number;
  vibration: number;
  mulank: number;
  bhagyank: number;
  lastDigit: number;
  lastFour: string;
  /** 1-10 score, higher is better. */
  harmony: number;
  verdict: MobileVerdict;
  digitFrequency: Record<number, number>;
  friendlyDigits: number[];
  enemyDigits: number[];
  /** Digits 1-9 that never appear at all — same "quality worth building deliberately" framing
   * as the Lo Shu Grid's own missing digits, so the two panels read consistently. */
  missingDigits: number[];
  /** A digit appearing 3+ times — amplifies that digit's classical influence, for better or
   * worse depending on whether it's friendly or an enemy to the Mulank. */
  repeatedDigits: { digit: number; count: number }[];
  zeroCount: number;
  endsWithZero: boolean;
  digitPairs: DigitPairFinding[];
  /** `{label, detail}[]` — the exact DoshaYogaSummary shape StrengthsCautions.tsx already
   * renders, so this reuses that component with zero new UI. */
  positives: { label: string; detail: string }[];
  cautions: { label: string; detail: string }[];
}

/** Digit pairs classically read as favorable/unfavorable — see this module's own doc comment
 * on why this is one committed convention, not a claimed universal consensus. */
const FAVORABLE_PAIRS = new Set([
  '11',
  '12',
  '13',
  '15',
  '19',
  '23',
  '25',
  '29',
  '31',
  '32',
  '33',
  '37',
  '38',
  '51',
  '52',
  '55',
  '57',
  '66',
  '69',
  '73',
  '74',
  '75',
  '78',
  '83',
  '87',
  '92',
  '96',
]);
const UNFAVORABLE_PAIRS = new Set(['14', '16', '18', '26', '27', '28', '34', '41', '44', '46']);

const REPEAT_THRESHOLD = 3;

function countDigits(digits: string): Record<number, number> {
  const counts: Record<number, number> = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
    9: 0,
  };
  for (const ch of digits) {
    const d = Number(ch);
    if (Number.isFinite(d) && d >= 0 && d <= 9) counts[d] = (counts[d] ?? 0) + 1;
  }
  return counts;
}

function findDigitPairs(digits: string): DigitPairFinding[] {
  const out: DigitPairFinding[] = [];
  for (let i = 0; i < digits.length - 1; i++) {
    const pair = digits.slice(i, i + 2);
    if (FAVORABLE_PAIRS.has(pair)) out.push({ pair, favorable: true });
    else if (UNFAVORABLE_PAIRS.has(pair)) out.push({ pair, favorable: false });
  }
  return out;
}

/** First 2 + last 4 digits real, middle redacted — enough for the reader to recognize their
 * own number without this module (or its caller) ever needing to carry/log/prompt the full
 * value. Matches this app's other partial-PII display conventions (e.g. masked card numbers). */
function maskNumber(digits: string): string {
  return `${digits.slice(0, 2)}${'•'.repeat(digits.length - 6)}${digits.slice(-4)}`;
}

/**
 * Score how well a mobile vibration harmonises with the holder's Mulank +
 * Bhagyank. Weight Mulank (psychic — day-to-day vibration) higher than
 * Bhagyank (destiny — long arc) because mobile usage is a daily ritual.
 */
function harmonyScore(
  vibration: number,
  mulank: number,
  bhagyank: number,
  lastDigit: number,
): number {
  const mulankFriends = FRIENDLY_MAP[mulank] ?? [];
  const bhagFriends = FRIENDLY_MAP[bhagyank] ?? [];
  const mulankEnemies = ENEMY_MAP[mulank] ?? [];
  const bhagEnemies = ENEMY_MAP[bhagyank] ?? [];

  let score = 5; // neutral baseline

  // Vibration <-> Mulank (heavier weight)
  if (vibration === mulank) score += 3;
  else if (mulankFriends.includes(vibration)) score += 2;
  else if (mulankEnemies.includes(vibration)) score -= 3;

  // Vibration <-> Bhagyank
  if (vibration === bhagyank) score += 2;
  else if (bhagFriends.includes(vibration)) score += 1;
  else if (bhagEnemies.includes(vibration)) score -= 2;

  // Last digit nudges — most touched digit in daily life
  if (lastDigit === mulank || mulankFriends.includes(lastDigit)) score += 1;
  if (mulankEnemies.includes(lastDigit)) score -= 1;

  // Clamp to 1..10
  return Math.max(1, Math.min(10, score));
}

function scoreToVerdict(score: number): MobileVerdict {
  if (score >= 9) return 'powerful';
  if (score >= 7) return 'supportive';
  if (score >= 5) return 'neutral';
  return 'draining';
}

function buildPositivesAndCautions(a: Omit<MobileNumberAnalysis, 'positives' | 'cautions'>): {
  positives: { label: string; detail: string }[];
  cautions: { label: string; detail: string }[];
} {
  const positives: { label: string; detail: string }[] = [];
  const cautions: { label: string; detail: string }[] = [];

  if (a.vibration === a.mulank) {
    positives.push({
      label: 'Matches Your Mulank',
      detail: `This number's vibration (${a.vibration}) is exactly your own Mulank — the closest classical match a phone number can have.`,
    });
  } else if ((FRIENDLY_MAP[a.mulank] ?? []).includes(a.vibration)) {
    positives.push({
      label: 'Friendly To Your Mulank',
      detail: `Vibration ${a.vibration} sits in your Mulank ${a.mulank}'s friendly number group.`,
    });
  } else if ((ENEMY_MAP[a.mulank] ?? []).includes(a.vibration)) {
    cautions.push({
      label: 'Clashes With Your Mulank',
      detail: `Vibration ${a.vibration} is classically an enemy number to your Mulank ${a.mulank}.`,
    });
  }

  if ((FRIENDLY_MAP[a.bhagyank] ?? []).includes(a.vibration)) {
    positives.push({
      label: 'Friendly To Your Bhagyank',
      detail: `Vibration ${a.vibration} is also friendly to your Bhagyank ${a.bhagyank}.`,
    });
  } else if ((ENEMY_MAP[a.bhagyank] ?? []).includes(a.vibration)) {
    cautions.push({
      label: 'Clashes With Your Bhagyank',
      detail: `Vibration ${a.vibration} is classically an enemy number to your Bhagyank ${a.bhagyank}.`,
    });
  }

  const favorablePairs = a.digitPairs.filter((p) => p.favorable);
  if (favorablePairs.length > 0) {
    positives.push({
      label: 'Favorable Digit Pairs',
      detail: `${favorablePairs.length} classically favorable consecutive pair(s) in this number (e.g. ${favorablePairs[0]?.pair}).`,
    });
  }
  const unfavorablePairs = a.digitPairs.filter((p) => !p.favorable);
  if (unfavorablePairs.length > 0) {
    cautions.push({
      label: 'Unfavorable Digit Pairs',
      detail: `${unfavorablePairs.length} classically unfavorable consecutive pair(s) in this number (e.g. ${unfavorablePairs[0]?.pair}).`,
    });
  }

  if (a.zeroCount === 0) {
    positives.push({
      label: 'No Zeros',
      detail: 'Zeros classically read as delay and obstruction — this number has none.',
    });
  } else if (a.endsWithZero) {
    cautions.push({
      label: 'Ends In Zero',
      detail:
        'A trailing zero is the classical worst case for zeros — often read as recurring delays.',
    });
  } else if (a.zeroCount >= 3) {
    cautions.push({
      label: 'Several Zeros',
      detail: `This number carries ${a.zeroCount} zeros, which classically read as friction or delay.`,
    });
  }

  for (const r of a.repeatedDigits) {
    const isFriendly = (FRIENDLY_MAP[a.mulank] ?? []).includes(r.digit) || r.digit === a.mulank;
    const isEnemy = (ENEMY_MAP[a.mulank] ?? []).includes(r.digit);
    if (isFriendly) {
      positives.push({
        label: 'Repeating Friendly Digit',
        detail: `${r.digit} repeats ${r.count} times — amplifying a digit already friendly to your Mulank.`,
      });
    } else if (isEnemy) {
      cautions.push({
        label: 'Repeating Clashing Digit',
        detail: `${r.digit} repeats ${r.count} times — amplifying a digit that clashes with your Mulank.`,
      });
    }
  }

  if (positives.length === 0 && cautions.length === 0) {
    positives.push({
      label: 'Neutral Reading',
      detail:
        'Nothing strongly favorable or unfavorable stood out — a classically balanced number.',
    });
  }

  return { positives, cautions };
}

/**
 * Run the full analysis. The `dob` is used to derive Mulank + Bhagyank — we
 * don't trust the caller to pass them. `mobile` is consumed here only — the
 * caller must never persist or re-log the raw argument; the return value's
 * `maskedNumber` is the only representation of the number safe to store or
 * show downstream (see computeMobileNumberScores's own doc comment).
 *
 * Throws if the cleaned mobile is fewer than 10 digits.
 */
export function analyzeMobileNumber(mobile: string, dob: Date): MobileNumberAnalysis {
  const cleaned = (mobile ?? '').replace(/\D/g, '');
  if (cleaned.length < 10) {
    throw new Error('Invalid mobile: need at least 10 digits');
  }
  const digits = cleaned.slice(-10);

  let total = 0;
  for (const ch of digits) total += Number(ch);
  const vibration = reduceToSingleDigit(total);

  const mulank = calculateMulank(dob);
  const bhagyank = calculateBhagyank(dob);

  const lastDigit = Number(digits[digits.length - 1]);
  const lastFour = digits.slice(-4);

  const harmony = harmonyScore(vibration, mulank, bhagyank, lastDigit);
  const verdict = scoreToVerdict(harmony);
  const digitFrequency = countDigits(digits);
  const missingDigits = Array.from({ length: 9 }, (_, i) => i + 1).filter(
    (d) => (digitFrequency[d] ?? 0) === 0,
  );
  const repeatedDigits = Object.entries(digitFrequency)
    .map(([digit, count]) => ({ digit: Number(digit), count }))
    .filter((r) => r.count >= REPEAT_THRESHOLD)
    .sort((a, b) => b.count - a.count);
  const zeroCount = digitFrequency[0] ?? 0;

  const partial: Omit<MobileNumberAnalysis, 'positives' | 'cautions'> = {
    maskedNumber: maskNumber(digits),
    total,
    vibration,
    mulank,
    bhagyank,
    lastDigit,
    lastFour,
    harmony,
    verdict,
    digitFrequency,
    friendlyDigits: [...(FRIENDLY_MAP[mulank] ?? [])],
    enemyDigits: [...(ENEMY_MAP[mulank] ?? [])],
    missingDigits,
    repeatedDigits,
    zeroCount,
    endsWithZero: digits.endsWith('0'),
    digitPairs: findDigitPairs(digits),
  };
  const { positives, cautions } = buildPositivesAndCautions(partial);

  return { ...partial, positives, cautions };
}

export interface SuggestedPhoneNumber {
  /** Illustrative full number sharing the reader's real 6-digit prefix — a CONCRETE example of
   * the pattern, not a number reserved for them; see this module's doc comment on
   * suggestPhoneNumbers for why only the last 4 digits are ever synthesized. */
  example: string;
  /** Masked form of `example` (first 2 + last 4), matching `maskedNumber`'s convention — the
   * caller should prefer this for anything that reaches a prompt or a log. */
  maskedExample: string;
  vibration: number;
  /** 0-100, clamped [40, 99] — same convention as name-scoring.ts's ScoredName.score, so a
   * reader comparing this report against the Name Change report sees one consistent scale. */
  score: number;
  reasons: string[];
  /** Top 2 by rank — the report's "Best Match" pill, same convention as name-scoring.ts's
   * ScoredName.recommended (rankScoredNames). */
  recommended: boolean;
}

const SUGGESTION_MIN_SCORE = 40;
const SUGGESTION_MAX_SCORE = 99;
const PREFIX_LENGTH = 6;

/** Scales harmonyScore's 1-10 into the app's shared [40, 99] percentage convention. */
function harmonyToPercent(harmony: number): number {
  const pct = Math.round(
    ((harmony - 1) / 9) * (SUGGESTION_MAX_SCORE - SUGGESTION_MIN_SCORE) + SUGGESTION_MIN_SCORE,
  );
  return Math.max(SUGGESTION_MIN_SCORE, Math.min(SUGGESTION_MAX_SCORE, pct));
}

/**
 * Which vibrations (1-9) are worth suggesting, best first: exact Mulank/Bhagyank match, then
 * the rest of the Mulank-friendly set, then the rest of the Bhagyank-friendly set — excluding
 * the number's OWN current vibration (no point "suggesting" what it already is) and excluding
 * anything in either enemy list. Never returns more than `limit`.
 */
/**
 * Three widening tiers, so `limit` candidates are (almost) always found:
 *   1. mulank/bhagyank's own friendly numbers, excluding either's enemies;
 *   2. any vibration 1-9 that isn't an enemy of either (covers the friendly set plus neutral
 *      ones — needed because a number CAN be friendly to Mulank while its own enemy list still
 *      excludes it, e.g. FRIENDLY_MAP[9] includes 6 but ENEMY_MAP[6] doesn't include 9 back —
 *      the tables aren't symmetric, so tier 1 alone under-fills more often than it looks);
 *   3. every remaining vibration, enemies included — some Mulank/Bhagyank PAIRS have enemy
 *      lists that union to cover all 9 digits (e.g. Mulank 7 + Bhagyank 8), making "never an
 *      enemy" impossible to satisfy at all. Better to surface a genuinely low-scoring option
 *      (harmonyScore already penalizes it honestly) than to silently return fewer than asked.
 * `currentVibration` is excluded at every tier — suggesting what the number already is is
 * never useful.
 */
function candidateVibrations(
  mulank: number,
  bhagyank: number,
  currentVibration: number,
  limit: number,
): number[] {
  const enemies = new Set([...(ENEMY_MAP[mulank] ?? []), ...(ENEMY_MAP[bhagyank] ?? [])]);
  const out: number[] = [];
  const consider = (v: number, allowEnemy: boolean) => {
    if (v < 1 || v > 9 || v === currentVibration || out.includes(v)) return;
    if (!allowEnemy && enemies.has(v)) return;
    out.push(v);
  };

  const ranked = [
    mulank,
    bhagyank,
    ...(FRIENDLY_MAP[mulank] ?? []),
    ...(FRIENDLY_MAP[bhagyank] ?? []),
  ];
  for (const v of ranked) {
    if (out.length >= limit) break;
    consider(v, false);
  }
  for (let v = 1; out.length < limit && v <= 9; v++) consider(v, false);
  for (let v = 1; out.length < limit && v <= 9; v++) consider(v, true);

  return out.slice(0, limit);
}

/**
 * Finds the smallest 4-digit suffix (0000-9999) that, appended to `prefix`, makes the FULL
 * 10-digit number reduce to `targetVibration` — skipping any suffix ending in 0 (matches this
 * module's own "never end in zero" rule) or starting with 0 followed by 3 more zeros (i.e.
 * avoids an all/near-all-zero suffix, which would otherwise often be the mathematically
 * "smallest" match). Always finds a match: a 4-digit sum ranges 0-36, which covers every
 * residue mod 9, so some suffix in 0000-9999 always reduces the total to any target 1-9.
 */
function findSuffixForVibration(prefix: string, targetVibration: number): string {
  const prefixSum = prefix.split('').reduce((s, d) => s + Number(d), 0);
  for (let n = 0; n <= 9999; n++) {
    const suffix = String(n).padStart(4, '0');
    if (suffix.endsWith('0')) continue;
    const total = prefixSum + suffix.split('').reduce((s, d) => s + Number(d), 0);
    if (reduceToSingleDigit(total) === targetVibration) return suffix;
  }
  // Defensive fallback — mathematically unreachable given the residue-coverage argument above.
  return '1111';
}

/**
 * Suggests up to `limit` (default 5) replacement-number PATTERNS, each keeping the reader's
 * REAL operator/series prefix (first 6 digits) — an Indian mobile number is series-bound to a
 * telecom operator, so a wholly invented 10-digit string is not a number the reader could
 * actually obtain. Each suggestion's `example` is one concrete illustration of "this prefix +
 * a last-4-digit suffix landing on a friendly vibration" — the reader is meant to ask their
 * provider for an available number matching that VIBRATION on the same prefix, not to request
 * this exact example number (see llm/reports/numerology.ts's prompt instruction, which states
 * this explicitly). Deterministic, no LLM call: `reasons` are given facts for the narrative
 * layer to explain, never invented by it (same discipline as name-lookup.ts's
 * rankNamesForTargets).
 */
export function suggestPhoneNumbers(mobile: string, dob: Date, limit = 5): SuggestedPhoneNumber[] {
  const cleaned = (mobile ?? '').replace(/\D/g, '');
  if (cleaned.length < 10) return [];
  const digits = cleaned.slice(-10);
  const prefix = digits.slice(0, PREFIX_LENGTH);

  const mulank = calculateMulank(dob);
  const bhagyank = calculateBhagyank(dob);
  let currentTotal = 0;
  for (const ch of digits) currentTotal += Number(ch);
  const currentVibration = reduceToSingleDigit(currentTotal);

  const vibrations = candidateVibrations(mulank, bhagyank, currentVibration, limit);

  const scored = vibrations.map((vibration) => {
    const suffix = findSuffixForVibration(prefix, vibration);
    const example = prefix + suffix;
    const lastDigit = Number(suffix[suffix.length - 1]);
    const harmony = harmonyScore(vibration, mulank, bhagyank, lastDigit);
    const reasons: string[] = [];
    if (vibration === mulank) reasons.push(`Matches your Mulank ${mulank} exactly`);
    else if (vibration === bhagyank) reasons.push(`Matches your Bhagyank ${bhagyank} exactly`);
    else if (
      (FRIENDLY_MAP[mulank] ?? []).includes(vibration) ||
      (FRIENDLY_MAP[bhagyank] ?? []).includes(vibration)
    )
      reasons.push(`Sits in your friendly number group (vibration ${vibration})`);
    else
      reasons.push(
        `Best available option among the vibrations left after excluding your enemy numbers where possible`,
      );
    reasons.push('Keeps your existing operator/series prefix');
    reasons.push('Does not end in zero');

    return {
      example,
      maskedExample: maskNumber(example),
      vibration,
      score: harmonyToPercent(harmony),
      reasons,
    };
  });

  // `candidateVibrations` ranks by CONSTRUCTION (friendly tier before fallback tiers), which
  // isn't quite the same order as the actual score (harmonyScore also weighs the synthesized
  // suffix's last digit) — sort by score so "best first" and "top 2 recommended" both describe
  // the same ranking a reader actually sees.
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  return ranked.map((s, i) => ({ ...s, recommended: i < 2 }));
}
