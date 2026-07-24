import { describe, expect, it } from 'vitest';
import { getSubLord, computeKpSignificators } from '../src/lib/astro-engine/kpSubLord.js';

describe('getSubLord', () => {
  it("returns the nakshatra's own lord at the very start of the nakshatra (Bharani, ruled by Venus)", () => {
    // Bharani spans 13.333...° to 26.666...° (index 1). At the exact start, degreeWithinNakshatra = 0.
    expect(getSubLord(13 + 1 / 3)).toBe('Venus');
  });

  it('matches the hand-verified midpoint example for Bharani (Rahu at 50% through)', () => {
    // Bharani start = 13.333..., span = 13.333..., midpoint = 20.0 exactly.
    expect(getSubLord(20.0)).toBe('Rahu');
  });

  it("returns the nakshatra's own lord at the very start of Ashwini (ruled by Ketu, index 0)", () => {
    expect(getSubLord(0)).toBe('Ketu');
  });

  it('handles a longitude at or past 360° by normalizing', () => {
    // NOTE: deliberately not reusing the exact "13 + 1/3" cusp value from the
    // tests above here. `360 + 13 + 1/3` loses ~2e-14 of precision the moment
    // the literal is evaluated (IEEE-754 doubles carry fewer fractional bits
    // at magnitude ~373 than at ~13) — even a bare `(360 + 13 + 1/3) - 360`
    // is not === `13 + 1/3`, before getSubLord ever runs. Landing exactly on
    // a nakshatra-lord segment boundary is a zero-probability event for real
    // ephemeris longitudes, so this test uses a generic non-boundary value to
    // verify the actual property under test (wraparound normalization).
    expect(getSubLord(360 + 47.5)).toBe(getSubLord(47.5));
    expect(getSubLord(-12.25)).toBe(getSubLord(347.75));
  });
});

describe('computeKpSignificators', () => {
  const CHART: Record<string, unknown> = {
    ascendant: { sign: 'Aries', longitude: 5 },
    planets: [
      { planet: 'Sun', sign: 'Aries', longitude: 10 },
      { planet: 'Moon', sign: 'Taurus', longitude: 40 },
      { planet: 'Mercury', sign: undefined, longitude: undefined }, // missing longitude — should be skipped
    ],
  };

  it('includes the Ascendant plus every planet that has longitude data', () => {
    const results = computeKpSignificators(CHART);
    const names = results.map((r) => r.name);
    expect(names).toContain('Ascendant');
    expect(names).toContain('Sun');
    expect(names).toContain('Moon');
    expect(names).not.toContain('Mercury');
  });

  it('returns an empty array (not a throw) for a null chart', () => {
    expect(computeKpSignificators(null)).toEqual([]);
  });
});
