import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROFILE,
  RULESET_VERSION,
  aspectsHouse,
  getAstroDay,
  getProvenance,
  houseFrom,
  isKendraFrom,
  naturalRelation,
  nthHouseFrom,
  partOfSpan,
  signDignity,
} from '../../src/lib/astro-engine/rules/index.js';

describe('rules/houses: houses are counted inclusively', () => {
  it('the same house is the 1st, the opposite house the 7th', () => {
    expect(houseFrom(1, 1)).toBe(1);
    expect(houseFrom(1, 7)).toBe(7);
    expect(houseFrom(10, 1)).toBe(4);
    expect(houseFrom(12, 1)).toBe(2);
    expect(nthHouseFrom(12, 2)).toBe(1);
    expect(nthHouseFrom(10, 4)).toBe(1);
  });

  it('kendra from a house includes conjunction, the 4th, the 7th and the 10th only', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((h) => isKendraFrom(3, h))).toEqual([
      3, 6, 9, 12,
    ]);
  });

  it('every planet aspects the 7th; Mars 4/8, Jupiter 5/9, Saturn 3/10 as well', () => {
    const aspected = (planet: Parameters<typeof aspectsHouse>[0]) =>
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((h) => aspectsHouse(planet, 1, h));
    expect(aspected('Sun')).toEqual([7]);
    expect(aspected('Mars')).toEqual([4, 7, 8]);
    expect(aspected('Jupiter')).toEqual([5, 7, 9]);
    expect(aspected('Saturn')).toEqual([3, 7, 10]);
    // From house 10 the 7th is house 4.
    expect(aspectsHouse('Venus', 10, 4)).toBe(true);
    expect(aspectsHouse('Venus', 10, 5)).toBe(false);
  });
});

describe('rules/dignity: derived from the by-planet friendship table', () => {
  it('reads exaltation, debilitation and own sign before friendship', () => {
    expect(signDignity('Sun', 0)).toBe('exalted'); // Aries
    expect(signDignity('Sun', 6)).toBe('debilitated'); // Libra
    expect(signDignity('Sun', 4)).toBe('own'); // Leo
    expect(signDignity('Mercury', 5)).toBe('exalted'); // Virgo: exaltation wins over own sign
  });

  it('agrees with the planet table where the old transit sign table did not', () => {
    // The Moon has no natural enemy; Venus is neutral to her (Libra), Saturn too (Capricorn).
    expect(naturalRelation('Moon', 'Venus')).toBe('neutral');
    expect(signDignity('Moon', 6)).toBe('neutral');
    expect(signDignity('Moon', 9)).toBe('neutral');
    // Mars is neutral to Mercury, not an enemy (Aries).
    expect(signDignity('Mercury', 0)).toBe('neutral');
    // Jupiter is neutral to Saturn (Sagittarius).
    expect(signDignity('Saturn', 8)).toBe('neutral');
  });
});

describe('rules/day: the day runs from sunrise to the next sunrise', () => {
  const MUMBAI = [19.076, 72.8777, 5.5] as const;

  it('noon in Mumbai is daytime, about half way through, on the civil weekday', async () => {
    const noon = new Date(Date.UTC(2024, 3, 15, 6, 30)); // Mon 15 Apr 2024, 12:00 IST
    const day = await getAstroDay(noon, ...MUMBAI);
    expect(day).not.toBeNull();
    expect(day!.isDay).toBe(true);
    expect(day!.weekday).toBe(1);
    expect(day!.fraction).toBeGreaterThan(0.4);
    expect(day!.fraction).toBeLessThan(0.6);
    // Sunrise in Mumbai in mid-April is a little after 06:00 IST (00:30 UT).
    const sunriseIstHour =
      (day!.sunrise.getUTCHours() + 5.5 + day!.sunrise.getUTCMinutes() / 60) % 24;
    expect(sunriseIstHour).toBeGreaterThan(6);
    expect(sunriseIstHour).toBeLessThan(6.6);
    expect(partOfSpan(day!, 3)).toBe(1);
  }, 30_000);

  it('02:00 after midnight still belongs to the previous weekday, and is night', async () => {
    const twoAm = new Date(Date.UTC(2024, 3, 15, 20, 30)); // Tue 16 Apr 2024, 02:00 IST
    const day = await getAstroDay(twoAm, ...MUMBAI);
    expect(day!.isDay).toBe(false);
    expect(day!.weekday).toBe(1); // still Monday's day
    expect(day!.nextSunrise.getTime()).toBeGreaterThan(twoAm.getTime());
  }, 30_000);
});

describe('rules/profile and provenance', () => {
  it('the default profile is the pre-audit behaviour', () => {
    expect(DEFAULT_PROFILE.id).toBe('aroha-parashari-v2');
    expect(DEFAULT_PROFILE.defaultHouseSystem).toBe('whole-sign');
    expect(DEFAULT_PROFILE.dashaYearDays).toBe(365.25);
    expect(RULESET_VERSION).toBe(0);
  });

  it('an unregistered feature is reported as unverified, never as classical', () => {
    expect(getProvenance('no-such-feature').tag).toBe('UNVERIFIED');
  });
});
