import { describe, expect, it } from 'vitest';
import { hasRawJargon } from '../src/lib/llm/horoscope.js';

describe('hasRawJargon', () => {
  it('flags the exact leak seen in production (raw Dasha/Mahadasha/Antardasha/Yoga dump)', () => {
    expect(
      hasRawJargon(
        'Active Dasha: Saturn Mahadasha / Moon Antardasha (started 2014-12-16, ends 2033-12-16); Key Yogas: Shasha Yoga',
      ),
    ).toBe(true);
  });

  it('flags Ascendant and Nakshatra', () => {
    expect(hasRawJargon('Your Ascendant is Scorpio.')).toBe(true);
    expect(hasRawJargon('Moon transiting your birth Nakshatra today.')).toBe(true);
  });

  it('does not flag a properly plain-language reading', () => {
    expect(
      hasRawJargon(
        "You're in a long, demanding stretch that rewards patience and discipline, with an emotional, home-focused undertone.",
      ),
    ).toBe(false);
  });

  it('is case-insensitive for terms with no everyday-English meaning', () => {
    expect(hasRawJargon('MAHADASHA')).toBe(true);
    expect(hasRawJargon('mahadasha')).toBe(true);
  });

  /**
   * 2026-08-28: "yoga" and "dosha" used to be flagged case-insensitively like
   * every other term — but both are also ordinary English ("a good day for
   * yoga", "balance your doshas" is exactly the generic self-care advice this
   * prompt asks for), and a false positive here fails the ENTIRE six-block
   * reading, not just one block. This app's own fact generation always writes
   * a real astrological combination as a Title-Case named term ("Mangal
   * Dosha", "Shasha Yoga" — see the production-leak fixture above, which
   * still catches "Yoga" capitalized), never bare lowercase, so requiring the
   * capitalized form distinguishes a real leak from ordinary usage.
   */
  it('flags a NAMED yoga/dosha (Title Case) but not the everyday English word', () => {
    expect(hasRawJargon('Your chart carries a strong Raj Yoga.')).toBe(true);
    expect(hasRawJargon('Watch for signs of a Mangal Dosha this week.')).toBe(true);
    expect(hasRawJargon('a good day for yoga and quiet reflection')).toBe(false);
    expect(hasRawJargon('take time to balance your doshas through diet')).toBe(false);
  });
});
