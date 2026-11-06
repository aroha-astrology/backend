import { describe, it, expect, afterEach } from 'vitest';
import { detectAllYogas } from '../src/lib/astro-engine/yogas/index.js';
import { calculateChart } from '../src/lib/astro-engine/index.js';
import {
  DEFAULT_PROFILE,
  getActiveProfile,
  setActiveProfile,
} from '../src/lib/astro-engine/rules/profile.js';
import type { ChartData } from '../src/lib/shared/types/astrology.js';

/**
 * Viparita Raja Yoga after the Uttara Kalamrita, First Kanda ch. IV (register UK-I.IV):
 * the lord of the 6th in the 8th or 12th, of the 8th in the 6th or 12th, of the 12th in the
 * 6th or 8th; the two lords related; neither related to another of the five planets.
 * Aries Lagna: lord of 6 = Mercury, 8 = Mars, 12 = Jupiter.
 */

const SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];
const LORD: Record<string, string> = {
  Aries: 'Mars',
  Taurus: 'Venus',
  Gemini: 'Mercury',
  Cancer: 'Moon',
  Leo: 'Sun',
  Virgo: 'Mercury',
  Libra: 'Venus',
  Scorpio: 'Mars',
  Sagittarius: 'Jupiter',
  Capricorn: 'Saturn',
  Aquarius: 'Saturn',
  Pisces: 'Jupiter',
};

/** Aries-Lagna chart, whole-sign houses; `house` gives each planet's house (1-12). */
async function chartWith(house: Record<string, number>): Promise<ChartData> {
  const real = await calculateChart(1990, 1, 1, 12, 0, 5.5, 19.076, 72.8777, 'lahiri', 'W');
  const names = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  const planets = names.map((planet) => {
    const h = house[planet] ?? 1;
    return {
      planet,
      longitude: (h - 1) * 30 + 10,
      signIndex: h - 1,
      sign: SIGNS[h - 1],
      signDegree: 10,
      house: h,
      isRetrograde: false,
      speed: 1,
    };
  });
  const houses = SIGNS.map((sign, i) => ({
    house: i + 1,
    cusp: i * 30,
    sign,
    signIndex: i,
    lord: LORD[sign],
    planets: [] as string[],
  }));
  return {
    ...real,
    planets,
    houses,
    ascendant: { ...real.ascendant, signIndex: 0, sign: 'Aries' },
  } as unknown as ChartData;
}
const viparita = (c: ChartData) => detectAllYogas(c).find((y) => y.name === 'Viparita Raja Yoga')!;
const park = { Sun: 2, Moon: 3, Venus: 5, Saturn: 9, Rahu: 11, Ketu: 5 }; // clear of 6/8/12 and of 6/8/12 aspects where possible

afterEach(() => setActiveProfile(DEFAULT_PROFILE));

describe('Viparita Raja Yoga (Uttara Kalamrita)', () => {
  it('default profile is the text rule', () => {
    expect(getActiveProfile().viparitaRule).toBe('uttara-kalamrita');
  });

  it('8th lord (Mars) in the 12th with the 12th lord (Jupiter), nothing else near: formed', async () => {
    const c = await chartWith({ ...park, Mars: 12, Jupiter: 12, Mercury: 4 });
    const y = viparita(c);
    expect(y.present).toBe(true);
    expect(y.planets).toEqual(expect.arrayContaining(['Mars', 'Jupiter']));
  });

  it('a lord in its OWN dusthana is not one of the three yogas (8th lord in the 8th)', async () => {
    const c = await chartWith({ ...park, Mars: 8, Jupiter: 4, Mercury: 4 });
    expect(viparita(c).present).toBe(false);
  });

  it('two lords in dusthanas but not related to each other: not formed (the engine used to say yes)', async () => {
    // Mars (8th lord) in the 6th, Jupiter (12th lord) in the 8th: Mars 6th lord Mercury elsewhere
    const c = await chartWith({ ...park, Mars: 6, Jupiter: 8, Mercury: 8 });
    setActiveProfile({ ...DEFAULT_PROFILE, viparitaRule: 'aroha-two-of-three' });
    const old = viparita(c).present;
    setActiveProfile(DEFAULT_PROFILE);
    expect(old).toBe(true);
    expect(viparita(c).present).toBe(false);
  });

  it('exchange counts as related: 8th lord Mars in the 6th, 6th lord Mercury in the 8th', async () => {
    // Sun, Saturn and Jupiter moved so none of them aspects the 6th or 8th
    const c = await chartWith({ ...park, Mars: 6, Mercury: 8, Jupiter: 3, Sun: 4, Saturn: 10 });
    expect(viparita(c).present).toBe(true);
  });

  it('purity: another planet (Venus) joining the pair stops it; a node does not', async () => {
    const base = { ...park, Mars: 12, Jupiter: 12, Mercury: 4 };
    expect(viparita(await chartWith({ ...base, Venus: 12 })).present).toBe(false);
    expect(viparita(await chartWith({ ...base, Rahu: 12, Ketu: 6 })).present).toBe(true);
  });

  it('the old rule stays available as a profile option', async () => {
    const c = await chartWith({ ...park, Mars: 8, Jupiter: 8, Mercury: 4 });
    setActiveProfile({ ...DEFAULT_PROFILE, viparitaRule: 'aroha-two-of-three' });
    expect(viparita(c).present).toBe(true);
  });
});
