import { describe, expect, it } from 'vitest';
import {
  namesStartingWith,
  namesHittingTarget,
  rankNamesForTargets,
  inferGenderFromName,
} from '../src/lib/astro-engine/names/name-lookup.js';
import {
  computeNameAlignment,
  variantHitsTarget,
} from '../src/lib/astro-engine/numerology/nameCorrection.js';
import {
  ALL_GIVEN_NAMES,
  FEMALE_GIVEN_NAMES,
  MALE_GIVEN_NAMES,
} from '../src/lib/astro-engine/names/name-corpus.js';

describe('namesStartingWith', () => {
  it('returns only real corpus names that actually start with the given syllable', () => {
    const names = namesStartingWith('Chu', 25);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name.toLowerCase().startsWith('chu')).toBe(true);
      expect(ALL_GIVEN_NAMES).toContain(name);
    }
  });

  it('is case-insensitive on the syllable', () => {
    expect(namesStartingWith('chu', 25).sort()).toEqual(namesStartingWith('CHU', 25).sort());
  });

  it('never returns more than the requested limit', () => {
    expect(namesStartingWith('A', 5)).toHaveLength(5);
  });

  it('returns an empty list for a blank syllable rather than the whole corpus', () => {
    expect(namesStartingWith('', 25)).toEqual([]);
  });

  it('returns no duplicates even though unisex names appear in both source gender lists', () => {
    const names = namesStartingWith('A', 200);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
  });

  it('narrows to the male-coded pool for childGender="boy" and female-coded for "girl"', () => {
    const boy = new Set(namesStartingWith('A', 200, 'boy'));
    const girl = new Set(namesStartingWith('A', 200, 'girl'));
    // Narrowed pools shouldn't be identical to the unfiltered mixed pool.
    const mixed = new Set(namesStartingWith('A', 200));
    expect(boy).not.toEqual(mixed);
    expect(girl).not.toEqual(mixed);
  });
});

describe('gender pool excludes cross-listed ambiguous names', () => {
  // "Aditya" sits in BOTH FEMALE_GIVEN_NAMES and MALE_GIVEN_NAMES (one of 488 such names in
  // this corpus) — a reader who asks for one gender should never see a name the corpus itself
  // can't confidently attribute to that gender.
  it('never hands "Aditya" back for a stated-gender lookup, in either direction', () => {
    const male = namesStartingWith('Adi', 500, 'boy').map((n) => n.toLowerCase());
    const female = namesStartingWith('Adi', 500, 'girl').map((n) => n.toLowerCase());
    expect(male).not.toContain('aditya');
    expect(female).not.toContain('aditya');
  });

  it('still surfaces "Aditya" when no gender is stated (full corpus)', () => {
    const mixed = namesStartingWith('Adi', 500).map((n) => n.toLowerCase());
    expect(mixed).toContain('aditya');
  });
});

describe('inferGenderFromName', () => {
  it("guesses female from a name that's ONLY in the female slice", () => {
    expect(inferGenderFromName('Arpna Sharma')).toBe('female');
  });

  it('returns null for a name absent from the corpus entirely', () => {
    expect(inferGenderFromName('Zyxqlmnop')).toBeNull();
  });

  it('returns null (not a guess) for an ambiguous cross-listed name', () => {
    expect(inferGenderFromName('Aditya')).toBeNull();
  });

  it('only looks at the first token, ignoring the surname', () => {
    expect(inferGenderFromName('Arpna Verma')).toBe('female');
  });
});

describe('namesHittingTarget', () => {
  it('returns real corpus names whose OWN computed Chaldean number lands on a given target', () => {
    const targets = [3, 6, 9];
    const hits = namesHittingTarget(targets, 25);
    expect(hits.length).toBeGreaterThan(0);
    for (const { name, chaldean } of hits) {
      expect(ALL_GIVEN_NAMES).toContain(name);
      const recomputed = variantHitsTarget(name, targets);
      expect(recomputed.hits).toBe(true);
      expect(recomputed.chaldean).toBe(chaldean);
    }
  });

  it('returns an empty list for an empty target list rather than the whole corpus', () => {
    expect(namesHittingTarget([], 25)).toEqual([]);
  });

  it('never returns more than the requested limit', () => {
    expect(namesHittingTarget([1, 2, 3, 4, 5, 6, 7, 8, 9], 10)).toHaveLength(10);
  });

  it('returns no duplicate names even though unisex names appear in both source gender lists', () => {
    const hits = namesHittingTarget([1, 2, 3, 4, 5, 6, 7, 8, 9], 300);
    const names = hits.map((h) => h.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("draws only from the reader's own gender pool — a man is never handed a female-coded name", () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (const name of namesHittingTarget(all, 100, 'male').map((h) => h.name)) {
      expect(MALE_GIVEN_NAMES).toContain(name);
    }
    for (const name of namesHittingTarget(all, 100, 'female').map((h) => h.name)) {
      expect(FEMALE_GIVEN_NAMES).toContain(name);
    }
  });

  it("keeps the reader's surname on and scores the FULL resulting name, not the given name alone", () => {
    const targets = [3, 6, 9];
    const hits = namesHittingTarget(targets, 10, null, 'Sharma');
    expect(hits.length).toBeGreaterThan(0);
    for (const { name, chaldean } of hits) {
      expect(name.endsWith(' Sharma')).toBe(true);
      expect(ALL_GIVEN_NAMES).toContain(name.replace(/ Sharma$/, ''));
      // The number must be true of the name the reader would actually carry.
      expect(variantHitsTarget(name, targets)).toEqual({ chaldean, hits: true });
    }
  });
});

describe('rankNamesForTargets', () => {
  const alignment = computeNameAlignment('Priya Sharma', new Date('1990-05-15'));

  it("suggests a new FIRST name with the reader's own surname kept, gender-matched", () => {
    const ranked = rankNamesForTargets(alignment, 'Priya Sharma', 5, 'female');
    expect(ranked.length).toBeGreaterThan(0);
    for (const { name, chaldean } of ranked) {
      expect(name.endsWith(' Sharma')).toBe(true);
      expect(FEMALE_GIVEN_NAMES).toContain(name.replace(/ Sharma$/, ''));
      expect(variantHitsTarget(name, alignment.targets)).toEqual({ chaldean, hits: true });
    }
  });

  it('handles a single-word current name without leaving a stray space', () => {
    for (const { name } of rankNamesForTargets(alignment, 'Priya', 5, 'female')) {
      expect(name.trim()).toBe(name);
      expect(ALL_GIVEN_NAMES).toContain(name);
    }
  });
});
