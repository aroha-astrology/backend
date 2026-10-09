import { describe, it, expect } from 'vitest';
import type { Planet } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { analyzePlanetStrengths } from '../../src/lib/astro-engine/gemstones.js';
import { dignityOf } from '../../src/lib/astro-engine/astrocartography/relocation-areas.js';
import { signDignity } from '../../src/lib/astro-engine/rules/dignity.js';

// =============================================================================
// Audit item TR1, remainder (docs/engine-audit/C-critical-corrections.md)
// =============================================================================
// Gemstones and relocation kept their own copies of the dignity tables. They
// happened to agree with the shared table, so this is a lock, not a
// correction: the copies are gone and these expectations (the old literal
// tables, written out) must keep holding for every planet in every sign.
// =============================================================================

const EXALTED: Record<string, string> = {
  Sun: 'Aries',
  Moon: 'Taurus',
  Mars: 'Capricorn',
  Mercury: 'Virgo',
  Jupiter: 'Cancer',
  Venus: 'Pisces',
  Saturn: 'Libra',
  Rahu: 'Taurus',
  Ketu: 'Scorpio',
};
const DEBILITATED: Record<string, string> = {
  Sun: 'Libra',
  Moon: 'Scorpio',
  Mars: 'Cancer',
  Mercury: 'Pisces',
  Jupiter: 'Capricorn',
  Venus: 'Virgo',
  Saturn: 'Aries',
  Rahu: 'Scorpio',
  Ketu: 'Taurus',
};
const OWN: Record<string, string[]> = {
  Sun: ['Leo'],
  Moon: ['Cancer'],
  Mars: ['Aries', 'Scorpio'],
  Mercury: ['Gemini', 'Virgo'],
  Jupiter: ['Sagittarius', 'Pisces'],
  Venus: ['Taurus', 'Libra'],
  Saturn: ['Capricorn', 'Aquarius'],
  Rahu: ['Aquarius'],
  Ketu: ['Scorpio'],
};
// Signs owned by each planet's natural enemies.
const ENEMY: Record<string, string[]> = {
  Sun: ['Taurus', 'Libra', 'Capricorn', 'Aquarius'],
  Moon: [],
  Mars: ['Gemini', 'Virgo'],
  Mercury: ['Cancer'],
  Jupiter: ['Gemini', 'Virgo', 'Taurus', 'Libra'],
  Venus: ['Leo', 'Cancer'],
  Saturn: ['Leo', 'Cancer', 'Aries', 'Scorpio'],
  Rahu: ['Leo', 'Cancer', 'Aries', 'Scorpio'],
  Ketu: ['Leo', 'Cancer'],
};

describe('[TR1] gemstones read the one dignity table', () => {
  it('every planet in every sign carries the same dignity reasons as before', () => {
    for (const planet of Object.keys(EXALTED)) {
      for (const sign of ZODIAC_SIGNS) {
        const [row] = analyzePlanetStrengths({
          planets: [{ planet, sign, house: 1, longitude: 0, isRetrograde: false }],
        }).filter((r) => r.planet === planet);
        const reason = row!.reason;
        const at = `${planet} in ${sign}`;
        expect(reason.includes('Exalted'), at).toBe(EXALTED[planet] === sign);
        expect(reason.includes('Debilitated'), at).toBe(DEBILITATED[planet] === sign);
        expect(reason.includes('In own sign'), at).toBe(OWN[planet]!.includes(sign));
        expect(reason.includes('In enemy sign'), at).toBe(ENEMY[planet]!.includes(sign));
      }
    }
  });
});

describe('[TR1] relocation reads the one dignity table', () => {
  it('+1 exalted or own, -1 debilitated, 0 otherwise, for the seven planets', () => {
    for (const planet of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']) {
      ZODIAC_SIGNS.forEach((sign, signIndex) => {
        const expected =
          EXALTED[planet] === sign || OWN[planet]!.includes(sign)
            ? 1
            : DEBILITATED[planet] === sign
              ? -1
              : 0;
        expect(dignityOf(planet as Planet, signIndex), `${planet} in ${sign}`).toBe(expected);
        // And it is the shared helper's answer.
        const shared = signDignity(planet as Planet, signIndex);
        expect(expected === 1).toBe(shared === 'exalted' || shared === 'own');
        expect(expected === -1).toBe(shared === 'debilitated');
      });
    }
  });

  it('the nodes carry no dignity for relocation, as before', () => {
    expect(dignityOf('Rahu', 1)).toBe(0);
    expect(dignityOf('Ketu', 7)).toBe(0);
  });
});
