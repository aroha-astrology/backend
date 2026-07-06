import { describe, it, expect } from 'vitest';
import { parseStructuredResponse } from '../src/lib/llm/horoscope.js';

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
    // overall's score here is deliberately wrong/inconsistent (1) to prove
    // the server overrides it rather than trusting the model.
    overall: { ...VALID_CATEGORY, score: overallScore },
    luckyColor: 'Gold',
    luckyNumber: 7,
  });
}

describe('horoscope: parseStructuredResponse category handling', () => {
  it('parses all 4 categories from valid JSON', () => {
    const result = parseStructuredResponse(validRaw());
    expect(result).not.toBeNull();
    expect(result!.categories.health.score).toBe(4);
    expect(result!.categories.career.score).toBe(2);
    expect(result!.categories.marriage.score).toBe(3);
  });

  it("overrides overall.score/quality with the average of health/career/marriage, ignoring the model's own overall score", () => {
    const result = parseStructuredResponse(validRaw(1));
    // average(4, 2, 3) = 3
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
