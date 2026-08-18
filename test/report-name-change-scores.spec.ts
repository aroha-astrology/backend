import { describe, expect, it } from 'vitest';
import { computeNameChangeScores } from '../src/lib/astro-engine/reports/name-change.js';
import {
  computeNameAlignment,
  variantHitsTarget,
} from '../src/lib/astro-engine/numerology/nameCorrection.js';
import { generateSpellingVariants } from '../src/lib/astro-engine/names/name-variants.js';
import type { ReportScoreContext } from '../src/modules/reports/report-generator.types.js';

const NAME = 'Priya Sharma';
const DOB = '1990-05-15';

function makeCtx(overrides: Partial<ReportScoreContext> = {}): ReportScoreContext {
  return { chart: null, personName: NAME, personDob: DOB, ...overrides };
}

describe('computeNameChangeScores — delegates to the real deterministic engine', () => {
  it('computes the current name alignment via computeNameAlignment for the same name+dob', () => {
    const scores = computeNameChangeScores(makeCtx(), null);
    expect(scores.alignment).toEqual(computeNameAlignment(NAME, new Date(DOB)));
  });

  it('generates up to 12 variants via generateSpellingVariants, seeded from the computed alignment targets', () => {
    const scores = computeNameChangeScores(makeCtx(), null);
    expect(scores.variants).toEqual(generateSpellingVariants(NAME, scores.alignment.targets, 12));
    expect(scores.variants.length).toBeLessThanOrEqual(12);
  });

  it('surfaces the reader gender the alternative-name shortlist is filtered on, from personGender when stated', () => {
    expect(computeNameChangeScores(makeCtx({ personGender: 'female' }), null).gender).toBe(
      'female',
    );
    expect(computeNameChangeScores(makeCtx({ personGender: 'male' }), null).gender).toBe('male');
  });

  it("falls back to inferring gender from the reader's own first name when personGender is 'other'/missing", () => {
    // NAME is 'Priya Sharma' — 'Priya' is a female-only corpus name, so both 'other' and
    // missing personGender should infer 'female' rather than staying null.
    expect(computeNameChangeScores(makeCtx({ personGender: 'other' }), null).gender).toBe('female');
    expect(computeNameChangeScores(makeCtx(), null).gender).toBe('female');
  });

  it('stays null only when BOTH personGender and the first-name guess come up empty', () => {
    const scores = computeNameChangeScores(
      makeCtx({ personGender: 'other', personName: 'Zyxqlmnop' }),
      null,
    );
    expect(scores.gender).toBeNull();
  });

  it('leaves the surname untouched on at least half the variants (this report changes the first name)', () => {
    const scores = computeNameChangeScores(makeCtx(), null);
    const firstNameOnly = scores.variants.filter((v) => v.variant.endsWith(' Sharma'));
    expect(firstNameOnly.length).toBeGreaterThanOrEqual(Math.ceil(scores.variants.length / 2));
  });

  it('surfaces the exact name/dob actually used', () => {
    const scores = computeNameChangeScores(makeCtx(), null);
    expect(scores.currentName).toBe(NAME);
    expect(scores.dob).toBe(DOB);
  });

  it('every returned variant already hits one of the alignment targets (never a fabricated one)', () => {
    const scores = computeNameChangeScores(makeCtx(), null);
    for (const v of scores.variants) {
      // Recompute independently (not from the module under test) to prove the variant is real.
      expect(variantHitsTarget(v.variant, scores.alignment.targets)).toEqual({
        chaldean: v.chaldean,
        hits: true,
      });
    }
  });
});

describe('computeNameChangeScores — a name whose current spelling is already aligned', () => {
  it('produces a consistent alignment/variants pair for a different real name+dob', () => {
    const name = 'Amit Kumar';
    const dob = '1985-11-02';
    const scores = computeNameChangeScores(makeCtx({ personName: name, personDob: dob }), null);
    expect(scores.alignment).toEqual(computeNameAlignment(name, new Date(dob)));
    expect(scores.variants).toEqual(generateSpellingVariants(name, scores.alignment.targets, 12));
  });
});

describe('computeNameChangeScores — defensive fallbacks (should never trigger in real production traffic)', () => {
  it('never throws when personName/personDob are both missing', () => {
    expect(() => computeNameChangeScores({ chart: null }, null)).not.toThrow();
  });

  it('falls back to a placeholder name when personName is missing', () => {
    const scores = computeNameChangeScores(makeCtx({ personName: null }), null);
    expect(scores.currentName).toBe('Unknown');
  });

  it('falls back to a placeholder name when personName is an empty/whitespace string', () => {
    const scores = computeNameChangeScores(makeCtx({ personName: '   ' }), null);
    expect(scores.currentName).toBe('Unknown');
  });

  it('falls back to the epoch DOB when personDob is missing', () => {
    const scores = computeNameChangeScores(makeCtx({ personDob: null }), null);
    expect(scores.dob).toBe('1970-01-01');
  });

  it('falls back to the epoch DOB when personDob is unparseable', () => {
    const scores = computeNameChangeScores(makeCtx({ personDob: 'garbage' }), null);
    expect(scores.dob).toBe('1970-01-01');
  });

  it('still returns a well-formed alignment object on the defensive fallback path', () => {
    const scores = computeNameChangeScores({ chart: null }, null);
    expect(scores.alignment).toEqual(computeNameAlignment('Unknown', new Date('1970-01-01')));
  });
});
