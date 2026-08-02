import { describe, expect, it } from 'vitest';
import { generateSpellingVariants } from '../src/lib/astro-engine/names/name-variants.js';
import { variantHitsTarget } from '../src/lib/astro-engine/numerology/nameCorrection.js';

const TARGETS = [3, 6, 9];

describe('generateSpellingVariants', () => {
  it('only returns spellings whose FULL name actually reduces to a target number', () => {
    const variants = generateSpellingVariants('Priya Sharma', TARGETS, 12);
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      // Recomputed independently of the module under test.
      expect(variantHitsTarget(v.variant, TARGETS)).toEqual({ chaldean: v.chaldean, hits: true });
    }
  });

  it('keeps at least half the variants inside the first name, surname untouched', () => {
    const variants = generateSpellingVariants('Priya Sharma', TARGETS, 12);
    const firstNameOnly = variants.filter((v) => v.change.startsWith('first name —'));
    expect(firstNameOnly.length).toBeGreaterThanOrEqual(Math.ceil(variants.length / 2));
    for (const v of firstNameOnly) expect(v.variant.endsWith(' Sharma')).toBe(true);
  });

  it('labels every variant with which part of the name it touches', () => {
    for (const v of generateSpellingVariants('Priya Sharma', TARGETS, 12)) {
      expect(v.change).toMatch(/^(first name|surname) — .+/);
    }
  });

  it('never returns the original spelling, and never a duplicate', () => {
    const variants = generateSpellingVariants('Priya Sharma', TARGETS, 12);
    const seen = variants.map((v) => v.variant.toLowerCase());
    expect(seen).not.toContain('priya sharma');
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('never returns more than the requested count', () => {
    expect(generateSpellingVariants('Priya Sharma', TARGETS, 4).length).toBeLessThanOrEqual(4);
  });

  it('fills the section from the first name alone when there is no surname', () => {
    const variants = generateSpellingVariants('Priya', TARGETS, 12);
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) expect(v.change.startsWith('first name —')).toBe(true);
  });

  it('returns an empty list rather than throwing on the degenerate inputs', () => {
    expect(generateSpellingVariants('', TARGETS, 12)).toEqual([]);
    expect(generateSpellingVariants('   ', TARGETS, 12)).toEqual([]);
    expect(generateSpellingVariants('Priya Sharma', [], 12)).toEqual([]);
    expect(generateSpellingVariants('Priya Sharma', TARGETS, 0)).toEqual([]);
  });

  it('yields a section-sized list for typical Indian names, not the 1-3 the old generator managed', () => {
    for (const name of ['Priya Sharma', 'Subir Ghosh', 'Amit Kumar', 'Lakshmi Narayanan']) {
      expect(generateSpellingVariants(name, TARGETS, 12).length).toBeGreaterThanOrEqual(8);
    }
  });

  it('only proposes spellings a person could plausibly carry', () => {
    const names = ['Priya Sharma', 'Subir Ghosh', 'Ramesh', 'Amit Kumar', 'Lakshmi Narayanan'];
    for (const name of names) {
      for (const { variant } of generateSpellingVariants(name, TARGETS, 12)) {
        expect(variant).not.toMatch(/hh/i); // doubled aspirate: "Rameshh"
        // Doubled leading consonant ("SSubir"). A doubled leading VOWEL is fine — "Aamit",
        // "Eesha" and "Oormila" are all ordinary transliterations.
        expect(variant).not.toMatch(/(^|\s)([^aeiou\s])\2/i);
        expect(variant).not.toMatch(/[aeiou](ee|i|y)$/i); // vowel then vowel-suffix: "Priyaee"
        expect(variant).not.toMatch(/[a-z][A-Z]|\s[a-z]/); // case mangled by a substitution
      }
    }
  });
});
