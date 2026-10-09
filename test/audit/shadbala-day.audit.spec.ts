import { describe, it, expect } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';
import { calculateShadbala, kalaLords } from '../../src/lib/astro-engine/calculations/shadbala.js';
import { calculateChart } from '../../src/lib/astro-engine/calculations/planetPositions.js';
import { detectAllYogas } from '../../src/lib/astro-engine/yogas/index.js';
import {
  dayContextAt,
  estimateDayContext,
  getAstroDay,
  isDayChart,
  sunAboveHorizon,
  type DayContext,
} from '../../src/lib/astro-engine/rules/day.js';

// =============================================================================
// Audit items S1, S4 (docs/engine-audit/C-critical-corrections.md)
// =============================================================================
// These pin WHICH weekday, hour and part of the day a birth falls in. The
// points each lord then receives (45, 60, 60) are the file's existing values
// and are audited separately against the text.
// =============================================================================

const day = (over: Partial<DayContext>): DayContext => ({
  isDay: true,
  fraction: 0.5,
  weekday: 0,
  hoursSinceSunrise: 6,
  hoursFromSolarNoon: 0,
  civilDate: { year: 2000, month: 1, day: 1 },
  basis: 'ephemeris',
  ...over,
});

describe('[S1] weekday lord, hour lord and third of the day come from the real sunrise', () => {
  // Hour lords run Sun, Venus, Mercury, Moon, Saturn, Jupiter, Mars, the first
  // hour after sunrise belonging to the weekday lord.

  it('Sunday, 2 h 31 min after sunrise, first third of the day: Sun, Mercury, Mercury', () => {
    // Hours from Sunday sunrise: 1 Sun, 2 Venus, 3 Mercury. Day thirds are
    // Mercury, Sun, Saturn.
    expect(kalaLords(day({ weekday: 0, hoursSinceSunrise: 2.52, fraction: 0.214 }))).toMatchObject({
      dinaLord: 'Sun',
      horaLord: 'Mercury',
      tribhagaLord: 'Mercury',
    });
  });

  it('Wednesday night, 17th hour, middle third of the night: Mercury, Saturn, Venus', () => {
    // From Mercury: 1 Mercury, 2 Moon, 3 Saturn, 4 Jupiter, 5 Mars, 6 Sun,
    // 7 Venus, then the same seven again (8-14), 15 Mercury, 16 Moon, 17 Saturn.
    // Night thirds are Moon, Venus, Mars.
    expect(
      kalaLords(day({ isDay: false, weekday: 3, hoursSinceSunrise: 16.2, fraction: 0.5 })),
    ).toMatchObject({ dinaLord: 'Mercury', horaLord: 'Saturn', tribhagaLord: 'Venus' });
  });

  it('the 25th hour from any weekday lord is the next weekday lord', () => {
    // This is what makes the hour order and the weekday order one system.
    const weekdayLords: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
    for (let weekday = 0; weekday < 7; weekday++) {
      const last = kalaLords(day({ weekday, hoursSinceSunrise: 23.9 })).horaLord;
      const firstOfNext = kalaLords(day({ weekday: (weekday + 1) % 7, hoursSinceSunrise: 0 }));
      expect(firstOfNext.horaLord).toBe(weekdayLords[(weekday + 1) % 7]);
      // The 24th hour is one step before it in the hour order.
      const order: Planet[] = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars'];
      expect(order[(order.indexOf(last) + 1) % 7]).toBe(firstOfNext.horaLord);
    }
  });

  it('Tokyo, Sunday 10 March 2024, 08:30: the day is Sunday although it is still Saturday in UT', async () => {
    // 08:30 JST = Saturday 23:30 UT. Almanac sunrise in Tokyo that day is
    // 05:59 JST and sunset 17:45, so the birth is 2 h 31 min into an
    // 11 h 46 min day: third hour (Mercury), first third (Mercury), Sunday (Sun).
    // The old code read Saturday from the UT date and counted hours from 06:00 UT.
    const at = new Date(Date.UTC(2024, 2, 9, 23, 30));
    const astroDay = await getAstroDay(at, 35.6762, 139.6503, 9);
    expect(astroDay).not.toBeNull();
    const ctx = dayContextAt(astroDay!, at);

    expect(ctx.isDay).toBe(true);
    expect(ctx.weekday).toBe(0);
    expect(Math.abs(ctx.hoursSinceSunrise - 151 / 60)).toBeLessThan(0.06);
    expect(Math.abs(ctx.fraction - 151 / 706)).toBeLessThan(0.01);
    expect(kalaLords(ctx)).toMatchObject({
      dinaLord: 'Sun',
      horaLord: 'Mercury',
      tribhagaLord: 'Mercury',
    });

    // Without the place, the estimate from the chart's own Ascendant still has
    // the day/night and the weekday right. Its hour count is only a guess
    // (signs do not rise evenly), so the hour lord is not asserted.
    const chart = await calculateChart(2024, 3, 10, 8, 30, 9, 35.6762, 139.6503);
    const estimate = estimateDayContext(chart, at);
    expect(estimate.isDay).toBe(true);
    expect(estimate.weekday).toBe(0);
    expect(estimate.basis).toBe('chart');
    expect(kalaLords(estimate).dinaLord).toBe('Sun');
  }, 60_000);

  it('the weekday lord carries exactly 45 into Kala Bala', async () => {
    // Same chart, same hour lord (Mercury) and same third of the day; only the
    // weekday differs. Sunday, 3rd hour: Sun, Venus, Mercury. Saturday, 6th
    // hour: Saturn, Jupiter, Mars, Sun, Venus, Mercury.
    const chart = await calculateChart(2024, 3, 10, 8, 30, 9, 35.6762, 139.6503);
    const sunday = calculateShadbala(
      chart,
      day({ weekday: 0, hoursSinceSunrise: 2.5, fraction: 0.2 }),
    );
    const saturday = calculateShadbala(
      chart,
      day({ weekday: 6, hoursSinceSunrise: 5.5, fraction: 0.2 }),
    );
    const kala = (rows: typeof sunday, planet: Planet) =>
      rows.find((r) => r.planet === planet)!.kalaBala;

    expect(kala(sunday, 'Sun') - kala(saturday, 'Sun')).toBeCloseTo(45, 2);
    expect(kala(saturday, 'Saturn') - kala(sunday, 'Saturn')).toBeCloseTo(45, 2);
    for (const planet of ['Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus'] as Planet[]) {
      expect(kala(sunday, planet)).toBeCloseTo(kala(saturday, planet), 2);
    }
  }, 60_000);
});

describe('[S4] day or night is read from the Ascendant degree, not the Sun’s whole-sign house', () => {
  // The risen half of the ecliptic is the 180 degrees behind the Ascendant.

  it('Sun 3 degrees behind the Ascendant in the same sign has just risen', () => {
    // Ascendant 5 Aries, Sun 2 Aries: house 1 by sign, but above the horizon.
    expect(sunAboveHorizon(5, 2)).toBe(true);
    // Ascendant 5 Aries, Sun 25 Pisces: 10 degrees risen.
    expect(sunAboveHorizon(5, 355)).toBe(true);
  });

  it('Sun 3 degrees short of the Descendant in the 7th sign has just set', () => {
    // Ascendant 5 Aries, Descendant 5 Libra, Sun 2 Libra: house 7 by sign, below the horizon.
    expect(sunAboveHorizon(5, 182)).toBe(false);
    // Sun 8 Libra is still above it.
    expect(sunAboveHorizon(5, 188)).toBe(true);
  });

  function chartWith(
    ascSignIndex: number,
    ascDegree: number,
    longitudes: Partial<Record<Planet, number>>,
  ): ChartData {
    const all: Planet[] = [
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
    const planets = all.map((planet, i) => {
      // Unplaced planets sit mid-sign in the 3rd house (Ketu in the 9th).
      const fallback = ((ascSignIndex + (planet === 'Ketu' ? 8 : 2)) % 12) * 30 + 10 + i;
      const longitude = longitudes[planet] ?? fallback;
      const signIndex = Math.floor(longitude / 30);
      return {
        planet,
        house: ((signIndex - ascSignIndex + 12) % 12) + 1,
        signIndex,
        sign: ZODIAC_SIGNS[signIndex]!,
        signDegree: longitude - signIndex * 30,
        longitude,
        latitude: 0,
        speed: 1,
        isRetrograde: false,
      };
    });
    const houses = ZODIAC_SIGNS.map((_, i) => {
      const signIndex = (ascSignIndex + i) % 12;
      const sign = ZODIAC_SIGNS[signIndex]!;
      return {
        house: i + 1,
        sign,
        signIndex,
        cusp: signIndex * 30,
        lord: SIGN_LORDS[sign],
        planets: planets.filter((p) => p.house === i + 1).map((p) => p.planet),
      };
    });
    return {
      planets,
      houses,
      ascendant: { sign: ZODIAC_SIGNS[ascSignIndex]!, signIndex: ascSignIndex, degree: ascDegree },
      ayanamsa: 'lahiri',
      ayanamsaValue: 24,
      julianDay: 2451545,
    } as unknown as ChartData;
  }

  const mahaBhagya = (chart: ChartData) =>
    detectAllYogas(chart).find((y) => y.name === 'MahaBhagya Yoga')!;

  it('MahaBhagya (day birth, Sun, Moon and Lagna in odd signs) holds an hour after sunrise', () => {
    // Lagna 20 Aries, Sun 5 Aries (15 degrees risen), Moon 10 Gemini: all odd, day birth.
    const chart = chartWith(0, 20, { Sun: 5, Moon: 70 });
    expect(isDayChart(chart)).toBe(true);
    expect(mahaBhagya(chart).present).toBe(true);
  });

  it('MahaBhagya (night birth, all three in even signs) holds an hour after sunset', () => {
    // Lagna 20 Taurus (50), Descendant 20 Scorpio (230), Sun 5 Scorpio (215):
    // 15 degrees short of the Descendant, so it set before it. Moon 10 Cancer (100): all even.
    const chart = chartWith(1, 20, { Sun: 215, Moon: 100 });
    expect(isDayChart(chart)).toBe(false);
    expect(mahaBhagya(chart).present).toBe(true);
  });
});
