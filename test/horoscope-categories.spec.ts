import { describe, it, expect } from 'vitest';
import { parseStructuredResponse, parseYearlyResponse } from '../src/lib/llm/horoscope.js';

const VALID_CATEGORY = {
  hook: 'Test hook',
  description: 'Test description that is long enough.',
  advice: 'Test advice.',
  quality: 'good',
  score: 5,
};

function validRaw(overallScore = 1) {
  return JSON.stringify({
    health: { ...VALID_CATEGORY, score: 4 },
    career: { ...VALID_CATEGORY, score: 2 },
    marriage: { ...VALID_CATEGORY, score: 3 },
    finance: { ...VALID_CATEGORY, score: 5 },
    education: { ...VALID_CATEGORY, score: 1 },
    // overall's score here is deliberately wrong/inconsistent (1) to prove
    // the server overrides it rather than trusting the model.
    overall: { ...VALID_CATEGORY, score: overallScore },
    luckyColor: 'Gold',
    luckyNumber: 7,
  });
}

describe('horoscope: parseStructuredResponse category handling', () => {
  it('parses all 6 categories from valid JSON', () => {
    const result = parseStructuredResponse(validRaw());
    expect(result).not.toBeNull();
    expect(result!.categories.health.score).toBe(4);
    expect(result!.categories.career.score).toBe(2);
    expect(result!.categories.marriage.score).toBe(3);
    expect(result!.categories.finance.score).toBe(5);
    expect(result!.categories.education.score).toBe(1);
  });

  it("overrides overall.score/quality with the average of the 5 sub-categories, ignoring the model's own overall score", () => {
    const result = parseStructuredResponse(validRaw(1));
    // average(4, 2, 3, 5, 1) = 3
    expect(result!.categories.overall.score).toBe(3);
    expect(result!.categories.overall.quality).toBe('moderate');
    // The model's narrative text for overall is still kept.
    expect(result!.categories.overall.hook).toBe('Test hook');
  });

  it('mirrors categories.overall onto the legacy top-level fields', () => {
    const result = parseStructuredResponse(validRaw(1));
    expect(result!.score).toBe(result!.categories.overall.score);
    expect(result!.quality).toBe(result!.categories.overall.quality);
    expect(result!.hook).toBe(result!.categories.overall.hook);
  });

  it('returns null when a category block is missing', () => {
    const raw = JSON.stringify({ health: VALID_CATEGORY, career: VALID_CATEGORY });
    expect(parseStructuredResponse(raw)).toBeNull();
  });

  it('returns null on unparseable JSON', () => {
    expect(parseStructuredResponse('not json')).toBeNull();
  });
});

function monthEntry(month: number, withHooks: boolean) {
  return {
    month,
    summary: `Summary for month ${month} that is long enough to pass.`,
    ...(withHooks
      ? {
          categoryHooks: {
            health: `Health hook ${month}`,
            career: `Career hook ${month}`,
            marriage: `Marriage hook ${month}`,
            finance: `Finance hook ${month}`,
            education: `Education hook ${month}`,
          },
        }
      : {}),
  };
}

function validYearlyRaw(withHooks: boolean) {
  return JSON.stringify({
    health: VALID_CATEGORY,
    career: VALID_CATEGORY,
    marriage: VALID_CATEGORY,
    finance: VALID_CATEGORY,
    education: VALID_CATEGORY,
    overall: VALID_CATEGORY,
    luckyColor: 'Gold',
    luckyNumber: 7,
    months: Array.from({ length: 12 }, (_, i) => monthEntry(i + 1, withHooks)),
  });
}

describe('horoscope: parseYearlyResponse per-month categoryHooks', () => {
  it('parses categoryHooks for every month when present and well-formed', () => {
    const result = parseYearlyResponse(validYearlyRaw(true));
    expect(result).not.toBeNull();
    expect(result!.months).toHaveLength(12);
    for (const m of result!.months) {
      expect(m.categoryHooks).toBeDefined();
      expect(m.categoryHooks!.health).toBe(`Health hook ${m.month}`);
      expect(m.categoryHooks!.education).toBe(`Education hook ${m.month}`);
    }
  });

  it('still parses months when categoryHooks is absent (older/incomplete responses)', () => {
    const result = parseYearlyResponse(validYearlyRaw(false));
    expect(result).not.toBeNull();
    expect(result!.months).toHaveLength(12);
    for (const m of result!.months) {
      expect(m.categoryHooks).toBeUndefined();
      expect(m.summary.length).toBeGreaterThan(0);
    }
  });
});
