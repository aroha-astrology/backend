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

describe('horoscope: parseStructuredResponse clamps category scores to the deterministic synthesis band', () => {
  it('leaves scores untouched when no synthesisScore is provided (backward compatible)', () => {
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

  it('clamps a category claiming "excellent" (5) down to the band when the synthesis score is 1', () => {
    const raw = rawWithScores({
      health: 5,
      career: 4,
      marriage: 3,
      finance: 2,
      education: 1,
      overall: 1,
    });
    const result = parseStructuredResponse(raw, 1);
    // Band for synthesisScore=1 is [1,2].
    expect(result!.categories.health.score).toBe(2);
    expect(result!.categories.career.score).toBe(2);
    expect(result!.categories.marriage.score).toBe(2);
    expect(result!.categories.finance.score).toBe(2);
    expect(result!.categories.education.score).toBe(1);
  });

  it('clamps a category claiming "avoid" (1) up to the band when the synthesis score is 5', () => {
    const raw = rawWithScores({
      health: 1,
      career: 2,
      marriage: 3,
      finance: 4,
      education: 5,
      overall: 5,
    });
    const result = parseStructuredResponse(raw, 5);
    // Band for synthesisScore=5 is [4,5].
    expect(result!.categories.health.score).toBe(4);
    expect(result!.categories.career.score).toBe(4);
    expect(result!.categories.marriage.score).toBe(4);
    expect(result!.categories.finance.score).toBe(4);
    expect(result!.categories.education.score).toBe(5);
  });

  it('recomputes quality to match the clamped score, not the original', () => {
    const raw = rawWithScores({
      health: 5,
      career: 3,
      marriage: 3,
      finance: 3,
      education: 3,
      overall: 3,
    });
    const result = parseStructuredResponse(raw, 1);
    // health clamped 5 -> 2, which is "challenging", not the model's "good".
    expect(result!.categories.health.score).toBe(2);
    expect(result!.categories.health.quality).toBe('challenging');
  });

  it('leaves an in-band score AND the model-reported quality untouched', () => {
    const raw = rawWithScores({
      health: 3,
      career: 3,
      marriage: 3,
      finance: 3,
      education: 3,
      overall: 3,
    });
    const result = parseStructuredResponse(raw, 3);
    // Band for synthesisScore=3 is [2,4] -- 3 is already inside it, so nothing
    // is rewritten: the model's own "good" (from the CATEGORY() fixture) is
    // trusted rather than force-recomputed from the score.
    expect(result!.categories.health.score).toBe(3);
    expect(result!.categories.health.quality).toBe('good');
  });

  it('derives overall from the ALREADY-CLAMPED sub-scores, then clamps overall itself', () => {
    // All sub-scores claim 5; synthesis says 1. Clamped sub-scores are all 2,
    // so the average (and thus overall) must be 2, never the unclamped 5.
    const raw = rawWithScores({
      health: 5,
      career: 5,
      marriage: 5,
      finance: 5,
      education: 5,
      overall: 5,
    });
    const result = parseStructuredResponse(raw, 1);
    expect(result!.categories.overall.score).toBe(2);
    expect(result!.score).toBe(2);
  });

  it('never produces a score outside 1-5 regardless of synthesisScore extremes', () => {
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
    for (const c of [lo.categories.health, hi.categories.health]) {
      expect(c.score).toBeGreaterThanOrEqual(1);
      expect(c.score).toBeLessThanOrEqual(5);
    }
  });
});

function monthEntry(month: number) {
  return { month, summary: `Summary for month ${month} that is long enough to pass.` };
}

describe('horoscope: parseYearlyResponse forwards synthesisScore to the same clamp', () => {
  it('clamps yearly category scores the same way as the non-yearly path', () => {
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
    expect(result!.structured.categories.health.score).toBe(2);
  });
});
