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
// Audit item YG6 (Gajakesari), register BPHS-36.3
// =============================================================================
// BPHS 36.3 (Sanskrit): kendre devagurau lagnāc candrād vā śubhadṛgyute /
// nīcāstārigṛhair hīne yogo 'yaṃ gajakesarī. "Jupiter in a kendra from the Lagna
// or from the Moon, joined or aspected by benefics, and free of debilitation
// (nīca), combustion (asta) and an enemy's house (ari-gṛha): this is Gajakesari."
// The engine asked only for Jupiter in a kendra from the Moon.
//
// Aries Lagna, house n = sign n. Longitudes are sign start + 14 + the planet's
// place in the list (Sun 14, Moon 15, Mars 16, Mercury 17, Jupiter 18, Venus 19,
// Saturn 20), so a Sun and a Jupiter in one sign are 4 degrees apart (combust).
// Unplaced planets sit in house 3, which aspects houses 5, 6, 9, 10, 12 and
// joins nothing below.
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

const present = (c: ChartData) =>
  detectAllYogas(c).find((y) => y.name === 'Gajakesari Yoga')!.present;

afterEach(() => setActiveProfile(DEFAULT_PROFILE));

describe('[YG6] Gajakesari follows BPHS 36.3', () => {
  it('Jupiter exalted in the 4th from the Lagna, joined by Venus: formed (Moon not in a kendra from it)', () => {
    expect(present(chart({ Jupiter: 4, Venus: 4, Sun: 8 }))).toBe(true);
  });

  it('Jupiter in the 1st (a friend of Mars) joined by Venus, the Moon away: formed through the Lagna', () => {
    expect(present(chart({ Jupiter: 1, Venus: 1, Moon: 3, Sun: 8 }))).toBe(true);
  });

  it('Jupiter in a kendra from the Moon (5th, Moon 2nd), aspected by Venus in the 11th: formed', () => {
    expect(present(chart({ Moon: 2, Jupiter: 5, Venus: 11, Sun: 8 }))).toBe(true);
  });

  it('no benefic joins or aspects Jupiter: not formed', () => {
    // Jupiter and the Moon in kendras (1st and 4th); nothing else near them.
    expect(present(chart({ Jupiter: 1, Moon: 4 }))).toBe(false);
  });

  it('Jupiter combust: not formed', () => {
    // Sun and Jupiter both in the 4th (4 degrees apart), Venus there too, Moon in the 1st.
    expect(present(chart({ Jupiter: 4, Sun: 4, Venus: 4, Moon: 1 }))).toBe(false);
  });

  it('Jupiter debilitated: not formed', () => {
    // Capricorn (house 10), aspected by Venus from the 4th, Moon in the 1st.
    expect(present(chart({ Jupiter: 10, Venus: 4, Moon: 1, Sun: 8 }))).toBe(false);
  });

  it("Jupiter in an enemy's sign: not formed", () => {
    // Libra (house 7) is Venus's sign, and Venus is Jupiter's enemy. Venus in the
    // 1st aspects it; the Moon is in the 1st.
    expect(present(chart({ Jupiter: 7, Venus: 1, Moon: 1, Sun: 8 }))).toBe(false);
  });
});

describe('[YG6] the earlier rule is a named profile value', () => {
  it('moon-kendra: Jupiter in a kendra from the Moon is enough', () => {
    setActiveProfile({ ...getActiveProfile(), gajakesariRule: 'moon-kendra' });
    expect(present(chart({ Jupiter: 1, Moon: 4 }))).toBe(true);
  });

  it('the default is the BPHS reading', () => {
    expect(DEFAULT_PROFILE.gajakesariRule).toBe('bphs');
  });
});
