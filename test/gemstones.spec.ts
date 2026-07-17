import { describe, it, expect } from 'vitest';
import { GEMSTONE_DATA, analyzePlanetStrengths } from '../src/lib/astro-engine/gemstones.js';

// Minimal chart fixtures — only the fields the condition checks read
// (chart.planets[].{planet,sign,house,longitude}, chart.houses[].{house,lord}).
function chart(overrides: { planets?: unknown[]; houses?: unknown[] }): Record<string, unknown> {
  return { planets: overrides.planets ?? [], houses: overrides.houses ?? [] };
}

describe("gemstones: conditionalDont.check — personalizes the Don't list per real chart data", () => {
  it('Sun: fires when Sun is in an enemy sign, not otherwise', () => {
    const check = GEMSTONE_DATA.Sun!.conditionalDont!.check;
    expect(check(chart({ planets: [{ planet: 'Sun', sign: 'Capricorn' }] }))).toBe(true);
    expect(check(chart({ planets: [{ planet: 'Sun', sign: 'Leo' }] }))).toBe(false);
  });

  it('Moon: fires when conjunct Rahu or Ketu (same house), not otherwise', () => {
    const check = GEMSTONE_DATA.Moon!.conditionalDont!.check;
    expect(
      check(
        chart({
          planets: [
            { planet: 'Moon', house: 5 },
            { planet: 'Rahu', house: 5 },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      check(
        chart({
          planets: [
            { planet: 'Moon', house: 5 },
            { planet: 'Ketu', house: 11 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('Mars: fires when Mars rules the 6th, 8th, or 12th house for the ascendant, not otherwise', () => {
    const check = GEMSTONE_DATA.Mars!.conditionalDont!.check;
    expect(check(chart({ houses: [{ house: 8, lord: 'Mars' }] }))).toBe(true);
    expect(check(chart({ houses: [{ house: 4, lord: 'Mars' }] }))).toBe(false);
  });

  it('Mercury: fires when combust (close to the Sun), not otherwise', () => {
    const check = GEMSTONE_DATA.Mercury!.conditionalDont!.check;
    expect(
      check(
        chart({
          planets: [
            { planet: 'Mercury', longitude: 100 },
            { planet: 'Sun', longitude: 105 },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      check(
        chart({
          planets: [
            { planet: 'Mercury', longitude: 10 },
            { planet: 'Sun', longitude: 200 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('Jupiter: fires when Jupiter itself sits in the 6th, 8th, or 12th house, not otherwise', () => {
    const check = GEMSTONE_DATA.Jupiter!.conditionalDont!.check;
    expect(check(chart({ planets: [{ planet: 'Jupiter', house: 6 }] }))).toBe(true);
    expect(check(chart({ planets: [{ planet: 'Jupiter', house: 9 }] }))).toBe(false);
  });

  it('Venus: fires when combust, not otherwise', () => {
    const check = GEMSTONE_DATA.Venus!.conditionalDont!.check;
    expect(
      check(
        chart({
          planets: [
            { planet: 'Venus', longitude: 50 },
            { planet: 'Sun', longitude: 55 },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      check(
        chart({
          planets: [
            { planet: 'Venus', longitude: 50 },
            { planet: 'Sun', longitude: 220 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('Saturn: fires when Saturn rules the 2nd or 7th house for the lagna, not otherwise', () => {
    const check = GEMSTONE_DATA.Saturn!.conditionalDont!.check;
    expect(check(chart({ houses: [{ house: 7, lord: 'Saturn' }] }))).toBe(true);
    expect(check(chart({ houses: [{ house: 5, lord: 'Saturn' }] }))).toBe(false);
  });

  it('Rahu: fires when Rahu itself sits in the 6th, 8th, or 12th house, not otherwise', () => {
    const check = GEMSTONE_DATA.Rahu!.conditionalDont!.check;
    expect(check(chart({ planets: [{ planet: 'Rahu', house: 12 }] }))).toBe(true);
    expect(check(chart({ planets: [{ planet: 'Rahu', house: 2 }] }))).toBe(false);
  });

  it('Ketu: fires when in an enemy sign or conjunct a natural malefic, not otherwise', () => {
    const check = GEMSTONE_DATA.Ketu!.conditionalDont!.check;
    expect(check(chart({ planets: [{ planet: 'Ketu', sign: 'Cancer', house: 3 }] }))).toBe(true);
    expect(
      check(
        chart({
          planets: [
            { planet: 'Ketu', sign: 'Aries', house: 3 },
            { planet: 'Mars', house: 3 },
          ],
        }),
      ),
    ).toBe(true);
    expect(check(chart({ planets: [{ planet: 'Ketu', sign: 'Aries', house: 3 }] }))).toBe(false);
  });

  it('degrades gracefully to false (never throws) when chart data is missing', () => {
    expect(GEMSTONE_DATA.Mars!.conditionalDont!.check(null)).toBe(false);
    expect(GEMSTONE_DATA.Saturn!.conditionalDont!.check(chart({}))).toBe(false);
  });
});

// Behavior-preserving refactor guard: isInEnemySign/isCombust get extracted into
// standalone helpers reused by conditionalDont.check, but analyzePlanetStrengths'
// own output must not change for these same signals.
describe('gemstones: analyzePlanetStrengths — unaffected by the conditionalDont refactor', () => {
  it('still flags an enemy-sign placement as weak with the sign named in the reason', () => {
    const result = analyzePlanetStrengths(
      chart({ planets: [{ planet: 'Sun', sign: 'Capricorn' }] }),
    );
    const sun = result.find((r) => r.planet === 'Sun')!;
    expect(sun.strength).toBe('weak');
    expect(sun.reason).toContain('enemy sign Capricorn');
  });

  it('still flags a combust placement as weak', () => {
    const result = analyzePlanetStrengths(
      chart({
        planets: [
          { planet: 'Mercury', sign: 'Aries', longitude: 100 },
          { planet: 'Sun', sign: 'Aries', longitude: 105 },
        ],
      }),
    );
    const mercury = result.find((r) => r.planet === 'Mercury')!;
    expect(mercury.strength).toBe('weak');
    expect(mercury.reason).toContain('Combust');
  });
});
