import { describe, it, expect, afterEach } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';
import { detectKemDrumaDosha } from '../../src/lib/astro-engine/doshas/kemDrumaDosha.js';
import { detectAllYogas } from '../../src/lib/astro-engine/yogas/index.js';
import {
  DEFAULT_PROFILE,
  getActiveProfile,
  setActiveProfile,
} from '../../src/lib/astro-engine/rules/profile.js';

// =============================================================================
// Audit item DS3 (docs/engine-audit/C-critical-corrections.md), register BJ-13.3
// =============================================================================
// Brihat Jataka 13.3: "Excepting the Sun, if the other planets occupy the 2nd,
// the 12th, or both ... from the Moon" the yogas are Sunapha, Anapha and
// Durudhara; "otherwise ... Kemadruma". "If the Moon occupy the Kendra from the
// ascendant, or if the Moon be accompanied by a planet, the yoga ceases to be a
// Kemadruma." The text also reports other views (an angle from the Moon, the
// navamsa) and says "these views are not considered as authoritative". It does
// not mention Jupiter's aspect.
//
// Charts: Aries Lagna, so house n is sign n. The Moon is in house 2 (Taurus)
// unless said; every planet not placed is parked in house 9 (the 8th from that
// Moon: not the 2nd, the 12th or an angle from it, and not aspecting it).
// Expected results are worked by counting houses, never from running the engine.
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
    const house = placed[planet] ?? (planet === 'Moon' ? 2 : 9);
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

const LATER = { exemptions: 'later-tradition' } as const;

function yogaPresent(c: ChartData): boolean {
  return detectAllYogas(c).find((y) => y.name === 'Kemadruma Cancellation')!.present;
}

afterEach(() => setActiveProfile(DEFAULT_PROFILE));

describe('[DS3] Kemadruma follows the Brihat Jataka', () => {
  it('a Moon with nothing but the Sun beside it is Kemadruma (the Sun is excepted)', () => {
    // Moon in house 2; Sun in house 3 (the 2nd from the Moon); Mars... parked in 9.
    const r = detectKemDrumaDosha(chart({ Sun: 3 }));
    expect(r.present).toBe(true);
  });

  it('a planet in the 2nd or the 12th from the Moon prevents it', () => {
    expect(detectKemDrumaDosha(chart({ Mars: 3 })).present).toBe(false); // 2nd from house 2
    expect(detectKemDrumaDosha(chart({ Venus: 1 })).present).toBe(false); // 12th from house 2
  });

  it('a planet in an angle from the Moon does NOT prevent it (a view the text rejects)', () => {
    // Mars in house 5 is the 4th from the Moon in house 2.
    expect(detectKemDrumaDosha(chart({ Mars: 5 })).present).toBe(true);
  });

  it("Jupiter's aspect does not cancel it (not in the text)", () => {
    // Jupiter in house 10 (Capricorn) aspects the 5th sign from itself = Taurus = house 2.
    const r = detectKemDrumaDosha(chart({ Jupiter: 10 }));
    expect(r.present).toBe(true);
    expect(r.cancellations).toEqual([]);
  });

  it('the Moon in an angle from the Lagna cancels it', () => {
    const r = detectKemDrumaDosha(chart({ Moon: 1 }));
    expect(r.present).toBe(false);
    expect(r.cancellations.length).toBe(1);
  });

  it('the Moon joined by any planet cancels it, the Sun included', () => {
    expect(detectKemDrumaDosha(chart({ Sun: 2 })).present).toBe(false);
    expect(detectKemDrumaDosha(chart({ Mercury: 2 })).present).toBe(false);
  });

  it('the plain case is flagged and is not called severe', () => {
    const r = detectKemDrumaDosha(chart({}));
    expect(r.present).toBe(true);
    expect(r.severity).not.toBe('severe');
    expect(r.description).not.toMatch(/severe|isolation/i);
    expect(r.description).toMatch(/2nd/);
  });
});

describe('[DS3] the later exemptions stay available as a named option', () => {
  it('later tradition: a planet in an angle from the Moon prevents it', () => {
    expect(detectKemDrumaDosha(chart({ Mars: 5 }), LATER).present).toBe(false);
  });

  it("later tradition: Jupiter's aspect on the Moon cancels it", () => {
    const r = detectKemDrumaDosha(chart({ Jupiter: 10 }), LATER);
    expect(r.present).toBe(false);
    expect(r.cancellations.join(' ')).toMatch(/Jupiter/);
  });

  it('later tradition keeps the older Venus-only conjunction rule', () => {
    expect(detectKemDrumaDosha(chart({ Venus: 2 }), LATER).present).toBe(false);
    expect(detectKemDrumaDosha(chart({ Sun: 2 }), LATER).present).toBe(true);
  });

  it('the profile names the option and defaults to the text', () => {
    expect(DEFAULT_PROFILE.kemadrumaExemptions).toBe('brihat-jataka');
  });

  it('the profile switches the dosha when no option is passed', () => {
    setActiveProfile({ ...getActiveProfile(), kemadrumaExemptions: 'later-tradition' });
    expect(detectKemDrumaDosha(chart({ Mars: 5 })).present).toBe(false);
  });
});

describe('[DS3] the Kemadruma Cancellation yoga agrees with the dosha', () => {
  it('Moon joined by the Sun: formed and cancelled, so the cancellation yoga is present', () => {
    expect(yogaPresent(chart({ Sun: 2 }))).toBe(true);
  });

  it("Jupiter's aspect alone no longer makes the cancellation yoga present", () => {
    expect(yogaPresent(chart({ Jupiter: 10 }))).toBe(false);
  });

  it('under the later option the aspect does', () => {
    setActiveProfile({ ...getActiveProfile(), kemadrumaExemptions: 'later-tradition' });
    expect(yogaPresent(chart({ Jupiter: 10 }))).toBe(true);
  });

  it('not formed, so nothing to cancel: a planet in the 2nd from the Moon', () => {
    expect(yogaPresent(chart({ Mars: 3 }))).toBe(false);
  });
});
