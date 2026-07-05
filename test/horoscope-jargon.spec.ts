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

  it('is case-insensitive', () => {
    expect(hasRawJargon('MAHADASHA')).toBe(true);
    expect(hasRawJargon('yoga')).toBe(true);
  });
});
