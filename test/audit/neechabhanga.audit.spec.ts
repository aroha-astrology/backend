import { describe, it, expect, afterEach } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';
import { detectAllYogas } from '../../src/lib/astro-engine/yogas/index.js';
import {
  DEFAULT_PROFILE,
  getActiveProfile,
  setActiveProfile,
} from '../../src/lib/astro-engine/rules/profile.js';

// =============================================================================
// Audit item YG6 (docs/engine-audit/C-critical-corrections.md), register PD-7.26-29
// =============================================================================
// Phaladeepika 7.26-29: a planet stands in its debilitation sign. It is raised
// (a king, an emperor) when
//   26, 29: the lord of that sign, or the lord of the sign where it is exalted,
//           is in a kendra from the Lagna or from the Moon;
//   27:     the lord of the debilitation sign and the lord of the exaltation sign
//           are in kendras from each other;
//   28:     the planet is aspected by the lord of its debilitation sign.
// The Navamsa rule and the "exaltation lord aspects it" and "conjunct the
// exaltation lord" rules the engine added are not in the text.
//
// Charts: Aries Lagna, house n = sign n. Unplaced planets sit in house 3. A
// kendra set from a house h is {h, h+3, h+6, h+9}, so the three starting points
// (Lagna, Moon, a lord) decide which houses they cover; each case below says
// how it keeps the other rules out.
// =============================================================================

const ALL: Planet[] = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
];

function chart(placed: Partial<Record<Planet, number>>): ChartData {
  const planets = ALL.map((planet, i) => {
    const house = placed[planet] ?? 3;
    const signIndex = house - 1;
    return {
      planet,
      house,
      signIndex,
      sign: ZODIAC_SIGNS[signIndex]!,
      signDegree: 14 + i,
      longitude: signIndex * 30 + 14 + i,
      latitude: 0,
      speed: 1,
      isRetrograde: false,
    };
  });
  const houses = ZODIAC_SIGNS.map((sign, i) => ({
    house: i + 1,
    sign,
    signIndex: i,
    cusp: i * 30,
    lord: SIGN_LORDS[sign],
    planets: planets.filter((p) => p.house === i + 1).map((p) => p.planet),
  }));
  return {
    planets,
    houses,
    ascendant: { sign: 'Aries', signIndex: 0, degree: 10 },
    ayanamsa: 'lahiri',
    ayanamsaValue: 24,
    julianDay: 2451545,
  } as unknown as ChartData;
}

const NAME = 'Neech Bhanga Raja Yoga';
const found = (c: ChartData) => detectAllYogas(c).find((y) => y.name === NAME)!;

afterEach(() => setActiveProfile(DEFAULT_PROFILE));

describe('[YG6] Neechabhanga follows the Phaladeepika', () => {
  it('26: the lord of the debilitation sign in a kendra from the Lagna', () => {
    // Sun in Libra (house 7); Venus, lord of Libra, in house 4.
    const y = found(chart({ Sun: 7, Venus: 4, Moon: 2 }));
    expect(y.present).toBe(true);
    expect(y.planets).toContain('Sun');
  });

  it('26: the lord of the exaltation sign in a kendra from the Moon, not from the Lagna', () => {
    // Sun in house 7. Mars (lord of Aries, where the Sun is exalted) in house 11,
    // the 10th from the Moon in house 2. Venus (lord of Libra) in house 3:
    // not a kendra from the Lagna (3) or the Moon (2nd from it), and not
    // in kendra from Mars (11 to 3 is the 5th).
    expect(found(chart({ Sun: 7, Mars: 11, Moon: 2, Venus: 3 })).present).toBe(true);
  });

  it('27: the two lords in kendras from each other, neither from the Lagna or the Moon', () => {
    // Venus in house 3, Mars in house 6: 3 to 6 is the 4th. Moon in house 2.
    expect(found(chart({ Sun: 7, Venus: 3, Mars: 6, Moon: 2 })).present).toBe(true);
  });

  it('28: aspected by the lord of its sign, with nothing else to cancel it', () => {
    // Saturn in Aries (house 1), debilitated; Mars rules Aries, in house 6, and
    // aspects the 8th from itself = house 1. Moon in house 4 (same kendra set as
    // the Lagna); Mars (house 6) is not a kendra from either; Venus, lord of
    // Libra where Saturn is exalted, in house 2 is not a kendra from either and
    // not a kendra from Mars (6 to 2 is the 9th).
    const y = found(chart({ Saturn: 1, Mars: 6, Moon: 4, Venus: 2 }));
    expect(y.present).toBe(true);
    expect(y.planets).toEqual(['Saturn']);
  });

  it('a debilitated planet with none of the four is not raised', () => {
    // Sun in house 7. Moon in house 4. Venus (house 3) and Mars (house 2) are in
    // residue classes that never meet the Lagna's, the Moon's or each other's kendras.
    expect(found(chart({ Sun: 7, Venus: 3, Mars: 2, Moon: 4 })).present).toBe(false);
  });

  it('the exaltation lord aspecting the planet is not in the text', () => {
    // Mars in house 12 aspects the Sun in house 7 (its 7th). Venus in house 2.
    // Moon in house 4: Mars (12) and Venus (2) are no kendra from the Lagna, the
    // Moon or each other (12 to 2 is the 3rd).
    expect(found(chart({ Sun: 7, Mars: 12, Venus: 2, Moon: 4 })).present).toBe(false);
  });

  it('Rahu and Ketu are not counted: the text speaks of planets', () => {
    // Rahu in Scorpio (house 8) is debilitated by the engine tables; Venus
    // (lord of Taurus, its exaltation sign) in house 4 would cancel it.
    const y = found(chart({ Rahu: 8, Venus: 4, Mars: 2, Moon: 3 }));
    expect(y.planets).not.toContain('Rahu');
  });
});

describe('[YG6] the earlier set is a named profile value', () => {
  it('earlier: the exaltation lord aspecting the planet cancels it', () => {
    setActiveProfile({ ...getActiveProfile(), neechabhangaRules: 'earlier' });
    expect(found(chart({ Sun: 7, Mars: 12, Venus: 2, Moon: 4 })).present).toBe(true);
  });

  it('the default is the Phaladeepika', () => {
    expect(DEFAULT_PROFILE.neechabhangaRules).toBe('phaladeepika');
  });
});
