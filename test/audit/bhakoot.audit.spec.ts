import { describe, it, expect, afterEach } from 'vitest';
import type { ZodiacSign } from '@aroha-astrology/shared';
import { calculateAshtakoota } from '../../src/lib/astro-engine/matching/ashtakoota.js';
import {
  DEFAULT_PROFILE,
  getActiveProfile,
  setActiveProfile,
} from '../../src/lib/astro-engine/rules/profile.js';

// =============================================================================
// Audit item MT3 (Bhakoot), register MC-6.31-33
// =============================================================================
// Muhurta Chintamani 6.31-33. The 2nd-12th, 5th-9th and 6th-8th relations of the
// two Moon signs are the faulty ones (6.31, which the editor calls an
// interpolation). 6.32-33 remove the fault when the two sign lords are one
// planet, or friends with the stars pure (nadi and tara), and the commentary
// adds that "the nadi must be pure in all of them" ("friendly shadashtaka" is
// itself one of the five exemptions of a 6-8). The engine zeroed every such pair.
//
// Stars (zero-based): Ashwini 0 (Adi), Bharani 1 (Madhya), Mrigashira 4 (Madhya),
// Ardra 5 (Adi).
//   (0, 1): different nadis; tara: Ashwini to Bharani is the 2nd, Bharani to
//           Ashwini the 27th (remainder 0): both good.   -> nadi pure, tara pure
//   (0, 4): different nadis; Ashwini to Mrigashira is the 5th: bad.
//           -> nadi pure, tara NOT pure
//   (0, 5): the same nadi (Adi).                         -> nadi NOT pure
// =============================================================================

const bhakoot = (n1: number, n2: number, s1: ZodiacSign, s2: ZodiacSign) =>
  calculateAshtakoota(n1, n2, s1, s2).scores.find((k) => k.koota === 'Bhakoot')!.score;

afterEach(() => setActiveProfile(DEFAULT_PROFILE));

describe('[MT3] Bhakoot follows Muhurta Chintamani 6.31-33', () => {
  it('a pair with the same sign lord is free of the fault: Aries-Scorpio (Mars), a 6-8', () => {
    expect(bhakoot(0, 1, 'Aries', 'Scorpio')).toBe(7);
  });

  it('Capricorn-Aquarius (Saturn), a 2-12, is free of it too', () => {
    expect(bhakoot(0, 1, 'Capricorn', 'Aquarius')).toBe(7);
  });

  it('an enemy 6-8 stays faulty: Taurus-Sagittarius (Venus, Jupiter)', () => {
    expect(bhakoot(0, 1, 'Taurus', 'Sagittarius')).toBe(0);
  });

  it('a friendly 6-8 is free of the fault with a pure nadi: Cancer-Sagittarius (Moon, Jupiter)', () => {
    expect(bhakoot(0, 1, 'Cancer', 'Sagittarius')).toBe(7);
    expect(bhakoot(0, 4, 'Cancer', 'Sagittarius')).toBe(7); // tara need not be pure
  });

  it('a 5-9 with friendly lords needs nadi and tara pure: Aries-Leo (Mars, Sun)', () => {
    expect(bhakoot(0, 1, 'Aries', 'Leo')).toBe(7);
    expect(bhakoot(0, 4, 'Aries', 'Leo')).toBe(0); // tara not pure
  });

  it('no exemption holds without a pure nadi', () => {
    expect(bhakoot(0, 5, 'Aries', 'Scorpio')).toBe(0);
    expect(bhakoot(0, 5, 'Cancer', 'Sagittarius')).toBe(0);
  });

  it('pairs that were never faulty are unchanged: Aries-Gemini', () => {
    expect(bhakoot(0, 1, 'Aries', 'Gemini')).toBe(7);
  });

  it('the earlier rule is a named profile value: every such pair is 0', () => {
    setActiveProfile({ ...getActiveProfile(), bhakootRule: 'earlier' });
    expect(bhakoot(0, 1, 'Aries', 'Scorpio')).toBe(0);
    expect(bhakoot(0, 1, 'Cancer', 'Sagittarius')).toBe(0);
  });

  it('the default follows the text', () => {
    expect(DEFAULT_PROFILE.bhakootRule).toBe('muhurta-chintamani');
  });
});
