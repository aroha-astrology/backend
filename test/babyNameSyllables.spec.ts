import { describe, expect, it } from 'vitest';
import {
  NAKSHATRA_NAMING_SYLLABLES,
  getNamingSyllable,
} from '../src/lib/astro-engine/babyNameSyllables.js';

describe('NAKSHATRA_NAMING_SYLLABLES', () => {
  it('has exactly 27 nakshatras, each with exactly 4 pada syllables', () => {
    expect(NAKSHATRA_NAMING_SYLLABLES).toHaveLength(27);
    for (const entry of NAKSHATRA_NAMING_SYLLABLES) {
      expect(entry.padas).toHaveLength(4);
      for (const syllable of entry.padas) {
        expect(syllable.length).toBeGreaterThan(0);
      }
    }
  });

  it('starts with Ashwini and ends with Revati, matching the standard nakshatra order', () => {
    expect(NAKSHATRA_NAMING_SYLLABLES[0]!.nakshatra).toBe('Ashwini');
    expect(NAKSHATRA_NAMING_SYLLABLES[26]!.nakshatra).toBe('Revati');
  });
});

describe('getNamingSyllable', () => {
  it('returns the correct syllable for Ashwini pada 1', () => {
    expect(getNamingSyllable(0, 1)).toBe('Chu');
  });

  it('returns the correct syllable for Revati pada 4', () => {
    expect(getNamingSyllable(26, 4)).toBe('Chee');
  });

  it('throws for an out-of-range nakshatra index', () => {
    expect(() => getNamingSyllable(27, 1)).toThrow('Invalid nakshatra index');
    expect(() => getNamingSyllable(-1, 1)).toThrow('Invalid nakshatra index');
  });

  it('throws for an out-of-range pada', () => {
    expect(() => getNamingSyllable(0, 0)).toThrow('Invalid pada');
    expect(() => getNamingSyllable(0, 5)).toThrow('Invalid pada');
  });
});
