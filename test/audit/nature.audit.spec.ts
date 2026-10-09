import { describe, it, expect } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { natureOf, isWaningMoon } from '../../src/lib/astro-engine/rules/nature.js';
import { detectAllYogas } from '../../src/lib/astro-engine/yogas/index.js';

// =============================================================================
// Audit item CN3 (docs/engine-audit/C-critical-corrections.md)
// =============================================================================
// Bṛhat Jātaka 2.5 (register BJ-2.5): "kṣīṇa-indv-arka-mahīsuta-arkatanayāḥ
// pāpā budhas tair yutaḥ" - the waning Moon, the Sun, Mars and Saturn are
// malefic, and Mercury is malefic when joined with them. Everything else is
// benefic. The engine kept one fixed list that made the Moon and Mercury
// benefic in every chart.
//
// Charts are built by hand with an Aries Lagna from planet longitudes, so
// sign index + 1 is the house.
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

/** Longitudes in degrees from 0 Aries. Unplaced planets sit in Gemini (sign 2), spread out. */
function chart(longitudes: Partial<Record<Planet, number>>): ChartData {
  const planets = ALL.map((planet, i) => {
    const longitude = longitudes[planet] ?? 62 + i * 2.5;
    const signIndex = Math.floor(longitude / 30);
    return {
      planet,
      house: signIndex + 1,
      signIndex,
      sign: ZODIAC_SIGNS[signIndex]!,
      signDegree: longitude - signIndex * 30,
      longitude,
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

// Sun at 10 Aries throughout the Moon cases.
const WAXING = chart({ Sun: 10, Moon: 100 }); // Moon 90 degrees ahead
const WANING = chart({ Sun: 10, Moon: 280 }); // Moon 270 degrees ahead, i.e. 90 behind
const FULL = chart({ Sun: 10, Moon: 190 }); // exactly 180 ahead

describe('[CN3] the Moon is benefic while waxing and malefic while waning', () => {
  it('90 degrees ahead of the Sun: waxing, benefic', () => {
    expect(isWaningMoon(WAXING)).toBe(false);
    expect(natureOf('Moon', WAXING)).toBe('benefic');
  });

  it('270 degrees ahead of the Sun (the dark half): waning, malefic', () => {
    expect(isWaningMoon(WANING)).toBe(true);
    expect(natureOf('Moon', WANING)).toBe('malefic');
  });

  it('exactly full (180 degrees) is still the bright half, as Paksha Bala counts it', () => {
    expect(natureOf('Moon', FULL)).toBe('benefic');
  });

  it('works across the 0/360 line: Sun at 350, Moon at 20 is 30 degrees ahead, waxing', () => {
    expect(natureOf('Moon', chart({ Sun: 350, Moon: 20 }))).toBe('benefic');
  });
});

describe('[CN3] the Sun, Mars and Saturn are malefic, Jupiter and Venus benefic, always', () => {
  it.each([WAXING, WANING])('in either half of the month', (c) => {
    expect(natureOf('Sun', c)).toBe('malefic');
    expect(natureOf('Mars', c)).toBe('malefic');
    expect(natureOf('Saturn', c)).toBe('malefic');
    expect(natureOf('Jupiter', c)).toBe('benefic');
    expect(natureOf('Venus', c)).toBe('benefic');
  });

  it('Rahu and Ketu are not in the text; they stay malefic by Aroha’s convention', () => {
    expect(natureOf('Rahu', WAXING)).toBe('malefic');
    expect(natureOf('Ketu', WAXING)).toBe('malefic');
  });
});

describe('[CN3] Mercury takes the nature of the company it keeps', () => {
  it('alone in its sign: benefic', () => {
    // Mercury 100 (Cancer); Sun in Aries, the waxing Moon elsewhere.
    expect(natureOf('Mercury', chart({ Sun: 10, Moon: 130, Mercury: 100 }))).toBe('benefic');
  });

  it('in the Sun’s sign: malefic', () => {
    expect(natureOf('Mercury', chart({ Sun: 10, Moon: 130, Mercury: 5 }))).toBe('malefic');
  });

  it('in Mars’s sign or in Saturn’s sign: malefic', () => {
    expect(natureOf('Mercury', chart({ Sun: 10, Moon: 130, Mars: 200, Mercury: 205 }))).toBe(
      'malefic',
    );
    expect(natureOf('Mercury', chart({ Sun: 10, Moon: 130, Saturn: 300, Mercury: 310 }))).toBe(
      'malefic',
    );
  });

  it('with the waning Moon: malefic; with the waxing Moon: benefic', () => {
    // Sun 10 Aries. Moon at 280 (waning) and Mercury also in Capricorn (270-300).
    expect(natureOf('Mercury', chart({ Sun: 10, Moon: 280, Mercury: 290 }))).toBe('malefic');
    // Moon at 100 (waxing) and Mercury also in Cancer (90-120).
    expect(natureOf('Mercury', chart({ Sun: 10, Moon: 100, Mercury: 110 }))).toBe('benefic');
  });

  it('with Jupiter or Venus only: benefic', () => {
    expect(
      natureOf('Mercury', chart({ Sun: 10, Moon: 130, Jupiter: 160, Venus: 170, Mercury: 165 })),
    ).toBe('benefic');
  });

  it('with Rahu only: benefic (the verse lists the Sun, Mars, Saturn and the waning Moon only)', () => {
    expect(natureOf('Mercury', chart({ Sun: 10, Moon: 130, Rahu: 250, Mercury: 255 }))).toBe(
      'benefic',
    );
  });

  it('being in the next sign is not being joined', () => {
    // Sun at 29 Aries, Mercury at 31 Taurus: 2 degrees apart but not conjunct by sign.
    expect(natureOf('Mercury', chart({ Sun: 29, Moon: 130, Mercury: 31 }))).toBe('benefic');
  });
});

const present = (c: ChartData, name: string) => {
  const found = detectAllYogas(c).find((y) => y.name === name);
  if (!found) throw new Error(`yoga "${name}" not returned`);
  return found.present;
};

describe('[CN3] Amala Yoga: a benefic in the 10th from the Lagna or the Moon', () => {
  // Aries Lagna: the 10th house is Capricorn (270-300).
  it('Jupiter in the 10th: Amala', () => {
    expect(present(chart({ Sun: 10, Moon: 130, Jupiter: 285 }), 'Amala Yoga')).toBe(true);
  });

  it('Mercury with the Sun in the 10th: no longer Amala, Mercury is malefic there', () => {
    expect(present(chart({ Sun: 280, Moon: 130, Mercury: 288 }), 'Amala Yoga')).toBe(false);
  });

  it('Mercury alone in the 10th: Amala', () => {
    expect(present(chart({ Sun: 10, Moon: 130, Mercury: 288 }), 'Amala Yoga')).toBe(true);
  });

  it('the waxing Moon in the 10th: Amala; the waning Moon in the 10th: not', () => {
    expect(present(chart({ Sun: 190, Moon: 285 }), 'Amala Yoga')).toBe(true); // 95 ahead
    expect(present(chart({ Sun: 10, Moon: 285 }), 'Amala Yoga')).toBe(false); // 275 ahead
  });
});

describe('[CN3] Adhi Yoga (from the Lagna) and Vasuki use the same nature', () => {
  it('Jupiter in the 6th and the Moon in the 7th: Adhi from the Lagna only while the Moon is waxing', () => {
    // 6th and 7th from an Aries Lagna: Virgo (150-180) and Libra (180-210).
    // Two of the three houses must hold a benefic.
    // Sun at 100: the Moon at 190 is 90 ahead, waxing, so benefic.
    expect(present(chart({ Sun: 100, Moon: 190, Jupiter: 160 }), 'Adhi Yoga (from Lagna)')).toBe(
      true,
    );
    // Sun at 5: the Moon at 190 is 185 ahead, waning, so malefic, and only Jupiter is left.
    expect(present(chart({ Sun: 5, Moon: 190, Jupiter: 160 }), 'Adhi Yoga (from Lagna)')).toBe(
      false,
    );
  });

  it('Vasuki: two benefics in the 3rd from the Lagna', () => {
    // 3rd from Aries is Gemini (60-90). Jupiter and Venus there.
    expect(present(chart({ Sun: 10, Moon: 130, Jupiter: 70, Venus: 75 }), 'Vasuki Yoga')).toBe(
      true,
    );
    // Jupiter and Mercury with the Sun in Gemini: Mercury is malefic, so only one benefic is left.
    expect(
      present(chart({ Sun: 65, Moon: 130, Jupiter: 70, Venus: 200, Mercury: 80 }), 'Vasuki Yoga'),
    ).toBe(false);
  });
});

describe('[CN3] there is one Adhi yoga from the Moon, not two with different rules', () => {
  it('"Chandra Adhi Yoga" is no longer reported beside "Adhi Yoga"', () => {
    const names = detectAllYogas(chart({ Sun: 10, Moon: 100 })).map((y) => y.name);
    expect(names).toContain('Adhi Yoga');
    expect(names).not.toContain('Chandra Adhi Yoga');
  });
});
