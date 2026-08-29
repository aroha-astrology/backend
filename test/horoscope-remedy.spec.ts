import { describe, it, expect } from 'vitest';
import { parseStructuredResponse } from '../src/lib/llm/horoscope.js';
import { SHLOKA_CATALOGUE, SHLOKA_SLUGS } from '../src/config/shloka-catalogue.js';

const VALID_CATEGORY = {
  hook: 'Test hook',
  description: 'Test description that is long enough.',
  advice: 'Test advice.',
  quality: 'good',
  score: 5,
};

function validRaw(remedy?: unknown) {
  return JSON.stringify({
    health: VALID_CATEGORY,
    career: VALID_CATEGORY,
    marriage: VALID_CATEGORY,
    finance: VALID_CATEGORY,
    education: VALID_CATEGORY,
    overall: VALID_CATEGORY,
    luckyColor: 'Gold',
    luckyNumber: 7,
    ...(remedy !== undefined ? { remedy } : {}),
  });
}

describe('horoscope: remedy mantra parsing', () => {
  it('keeps a valid remedy intact', () => {
    const result = parseStructuredResponse(
      validRaw({
        slug: 'mahamrityunjaya-mantra',
        japCount: 11,
        reason: 'Today favors steadying the body and easing tension.',
      }),
    );
    expect(result!.remedy).toEqual({
      slug: 'mahamrityunjaya-mantra',
      japCount: 11,
      reason: 'Today favors steadying the body and easing tension.',
    });
  });

  it('drops the remedy but keeps all six blocks when the slug is not a real mantra', () => {
    const result = parseStructuredResponse(
      validRaw({ slug: 'made-up-mantra', japCount: 11, reason: 'A fine plain reason here.' }),
    );
    expect(result).not.toBeNull();
    expect(result!.remedy).toBeUndefined();
    expect(result!.categories.health.hook).toBe('Test hook');
    expect(result!.categories.overall).toBeDefined();
  });

  it('drops the remedy when reason is empty', () => {
    const result = parseStructuredResponse(
      validRaw({ slug: 'gayatri-mantra', japCount: 11, reason: '   ' }),
    );
    expect(result!.remedy).toBeUndefined();
  });

  it('drops the remedy when reason leaks raw jargon', () => {
    const result = parseStructuredResponse(
      validRaw({ slug: 'gayatri-mantra', japCount: 11, reason: 'Your Ascendant favors chanting.' }),
    );
    expect(result!.remedy).toBeUndefined();
  });

  it('clamps an out-of-range japCount into 1..108', () => {
    const high = parseStructuredResponse(
      validRaw({ slug: 'gayatri-mantra', japCount: 500, reason: 'A fine plain reason here.' }),
    );
    expect(high!.remedy!.japCount).toBe(108);

    const low = parseStructuredResponse(
      validRaw({ slug: 'gayatri-mantra', japCount: 0, reason: 'A fine plain reason here.' }),
    );
    expect(low!.remedy!.japCount).toBe(1);
  });

  it('renders no remedy field at all when the model omits it (weekly/monthly path)', () => {
    const result = parseStructuredResponse(validRaw());
    expect(result).not.toBeNull();
    expect(result!.remedy).toBeUndefined();
    expect('remedy' in result!).toBe(false);
  });

  it('still parses successfully when remedy is malformed but everything else is valid', () => {
    const result = parseStructuredResponse(validRaw({ slug: 'gayatri-mantra' }));
    expect(result).not.toBeNull();
    expect(result!.remedy).toBeUndefined();
  });
});

describe('SHLOKA_CATALOGUE', () => {
  it('has exactly 50 entries', () => {
    expect(SHLOKA_CATALOGUE).toHaveLength(50);
  });

  it('has unique slugs, matching SHLOKA_SLUGS 1:1', () => {
    expect(new Set(SHLOKA_SLUGS).size).toBe(SHLOKA_SLUGS.length);
    expect(SHLOKA_SLUGS).toHaveLength(50);
  });

  it('every entry has a non-empty title and tags', () => {
    for (const entry of SHLOKA_CATALOGUE) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.tags.length).toBeGreaterThan(0);
    }
  });
});
