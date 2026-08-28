import { describe, it, expect } from 'vitest';
import { parseStructuredResponse, parseYearlyResponse } from '../src/lib/llm/horoscope.js';

const CATEGORY = (score: number) => ({
  hook: 'Test hook',
  description: 'Test description that is long enough.',
  advice: 'Test advice.',
  quality: 'good',
  score,
});

function rawWithScores(scores: {
  health: number;
  career: number;
  marriage: number;
  finance: number;
  education: number;
  overall: number;
}) {
  return JSON.stringify({
    health: CATEGORY(scores.health),
    career: CATEGORY(scores.career),
    marriage: CATEGORY(scores.marriage),
    finance: CATEGORY(scores.finance),
    education: CATEGORY(scores.education),
    overall: CATEGORY(scores.overall),
    luckyColor: 'Gold',
    luckyNumber: 7,
  });
}

/**
 * 2026-08-28: this suite used to assert that ALL SIX blocks (including the
 * five sub-categories) get clamped to synthesisScore +-1. That flattened the
 * one thing that should make a reading feel personal — each sub-category is
 * already house-grounded (2nd/11th for finance, 10th for career, 7th for
 * marriage...) and a day can genuinely read strong for career while flat for
 * health. Rewritten for the new contract: ONLY `overall` is clamped to the
 * deterministic synthesis band (it's the one number the star-rating UI leads
 * with, so it must track the math); the five detail blocks keep whatever
 * score the model reported (still bounded to 1-5 by parseCategoryBlock's own
 * scale normalization, just never forced into the synthesis band).
 */
describe('horoscope: parseStructuredResponse clamps ONLY overall to the deterministic synthesis band', () => {
  it('leaves every score untouched when no synthesisScore is provided (backward compatible)', () => {
    const raw = rawWithScores({
      health: 5,
      career: 5,
      marriage: 5,
      finance: 5,
      education: 5,
      overall: 1,
    });
    const result = parseStructuredResponse(raw);
    expect(result!.categories.health.score).toBe(5);
    expect(result!.categories.career.score).toBe(5);
  });

  it('does NOT clamp sub-categories even when they diverge sharply from the synthesis score', () => {
    const raw = rawWithScores({
      health: 5,
      career: 4,
      marriage: 3,
      finance: 2,
      education: 1,
      overall: 1,
    });
    const result = parseStructuredResponse(raw, 1);
    // Every sub-category keeps exactly the score the model reported — this is
    // the per-area variation the fix exists to preserve.
    expect(result!.categories.health.score).toBe(5);
    expect(result!.categories.career.score).toBe(4);
    expect(result!.categories.marriage.score).toBe(3);
    expect(result!.categories.finance.score).toBe(2);
    expect(result!.categories.education.score).toBe(1);
    // ...and each keeps the model's own reported quality too, since nothing
    // rewrote its score.
    expect(result!.categories.health.quality).toBe('good');
  });

  it('clamps `overall` down to the band when the synthesis score is 1, from the RAW (unclamped) sub-score average', () => {
    const raw = rawWithScores({
      health: 5,
      career: 5,
      marriage: 5,
      finance: 5,
      education: 5,
      overall: 5,
    });
    const result = parseStructuredResponse(raw, 1);
    // Sub-scores are untouched (still 5 each), so their raw average is 5 —
    // `overall` must still land inside synthesisScore=1's band, [1,2].
    expect(result!.categories.health.score).toBe(5);
    expect(result!.categories.overall.score).toBe(2);
    expect(result!.score).toBe(2); // legacy top-level field mirrors overall
  });

  it('clamps `overall` up to the band when the synthesis score is 5', () => {
    const raw = rawWithScores({
      health: 1,
      career: 1,
      marriage: 1,
      finance: 1,
      education: 1,
      overall: 1,
    });
    const result = parseStructuredResponse(raw, 5);
    // Band for synthesisScore=5 is [4,5]; raw sub-average is 1.
    expect(result!.categories.health.score).toBe(1);
    expect(result!.categories.overall.score).toBe(4);
  });

  it("recomputes `overall`'s quality to match its clamped score, not the model's reported quality", () => {
    const raw = rawWithScores({
      health: 3,
      career: 3,
      marriage: 3,
      finance: 3,
      education: 3,
      overall: 3,
    });
    const result = parseStructuredResponse(raw, 1);
    // Raw sub-average is 3; clamped into synthesisScore=1's band [1,2] -> 2,
    // which is "challenging", not the model's fixture "good".
    expect(result!.categories.overall.score).toBe(2);
    expect(result!.categories.overall.quality).toBe('challenging');
  });

  it('leaves `overall` untouched when its raw average is already in-band', () => {
    const raw = rawWithScores({
      health: 3,
      career: 3,
      marriage: 3,
      finance: 3,
      education: 3,
      overall: 3,
    });
    const result = parseStructuredResponse(raw, 3);
    // Band for synthesisScore=3 is [2,4] -- the raw average (3) is already
    // inside it, so nothing is rewritten.
    expect(result!.categories.overall.score).toBe(3);
  });

  it('never produces an overall score outside 1-5 regardless of synthesisScore extremes', () => {
    const raw = rawWithScores({
      health: 3,
      career: 3,
      marriage: 3,
      finance: 3,
      education: 3,
      overall: 3,
    });
    const lo = parseStructuredResponse(raw, 1)!;
    const hi = parseStructuredResponse(raw, 5)!;
    for (const r of [lo, hi]) {
      expect(r.categories.overall.score).toBeGreaterThanOrEqual(1);
      expect(r.categories.overall.score).toBeLessThanOrEqual(5);
    }
  });
});

function monthEntry(month: number) {
  return { month, summary: `Summary for month ${month} that is long enough to pass.` };
}

describe('horoscope: parseYearlyResponse forwards synthesisScore to the same overall-only clamp', () => {
  it('clamps yearly `overall` the same way as the non-yearly path, leaving sub-categories alone', () => {
    const raw = JSON.stringify({
      health: CATEGORY(5),
      career: CATEGORY(5),
      marriage: CATEGORY(5),
      finance: CATEGORY(5),
      education: CATEGORY(5),
      overall: CATEGORY(5),
      luckyColor: 'Gold',
      luckyNumber: 7,
      months: Array.from({ length: 12 }, (_, i) => monthEntry(i + 1)),
    });
    const result = parseYearlyResponse(raw, 1);
    expect(result).not.toBeNull();
    expect(result!.structured.categories.health.score).toBe(5);
    expect(result!.structured.categories.overall.score).toBe(2);
  });
});
