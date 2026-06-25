// @ts-nocheck
// =============================================================================
// Mobile Number Numerology
// =============================================================================
// Deterministic vibration + harmony scoring for a 10-digit mobile number,
// evaluated against the holder's Mulank and Bhagyank.

import { calculateMulank, calculateBhagyank, reduceToSingleDigit } from './vedic';

export type MobileVerdict = 'powerful' | 'supportive' | 'neutral' | 'draining';

export interface MobileNumberAnalysis {
  digits: string;
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
}

const FRIENDLY_MAP: Record<number, number[]> = {
  1: [1, 3, 5, 9],
  2: [2, 7, 9],
  3: [1, 3, 5, 9],
  4: [1, 4, 6, 8],
  5: [1, 3, 5, 9],
  6: [3, 6, 9],
  7: [2, 7, 9],
  8: [4, 6, 8],
  9: [1, 3, 5, 6, 9],
};

const ENEMY_MAP: Record<number, number[]> = {
  1: [2, 4, 8],
  2: [4, 5, 8],
  3: [4, 6, 8],
  4: [2, 3, 5, 7, 9],
  5: [2, 4, 6, 8],
  6: [1, 2, 5, 7, 8],
  7: [1, 3, 4, 5, 6, 8],
  8: [1, 2, 3, 5, 7, 9],
  9: [2, 4, 7, 8],
};

function countDigits(digits: string): Record<number, number> {
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  for (const ch of digits) {
    const d = Number(ch);
    if (Number.isFinite(d) && d >= 0 && d <= 9) counts[d]++;
  }
  return counts;
}

/**
 * Score how well a mobile vibration harmonises with the holder's Mulank +
 * Bhagyank. Weight Mulank (psychic — day-to-day vibration) higher than
 * Bhagyank (destiny — long arc) because mobile usage is a daily ritual.
 */
function harmonyScore(vibration: number, mulank: number, bhagyank: number, lastDigit: number): number {
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

/**
 * Run the full analysis. The `dob` is used to derive Mulank + Bhagyank — we
 * don't trust the caller to pass them.
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

  return {
    digits,
    total,
    vibration,
    mulank,
    bhagyank,
    lastDigit,
    lastFour,
    harmony,
    verdict,
    digitFrequency: countDigits(digits),
    friendlyDigits: FRIENDLY_MAP[mulank] ?? [],
    enemyDigits: ENEMY_MAP[mulank] ?? [],
  };
}

