import { describe, it, expect, vi } from 'vitest';
import { dashaLordTransitQuality } from '../../src/lib/astro-tools/transit.js';
import { findSolarReturnJd } from '../../src/lib/astro-engine/varshphal/solarReturn.js';
import {
  calculatePlanetPositions,
  dateToJulianDay,
} from '../../src/lib/astro-engine/calculations/planetPositions.js';

// =============================================================================
// Audit items TR1, TJ4, RC1 (docs/engine-audit/C-critical-corrections.md)
// =============================================================================

describe('[TR1] transit dignity follows the one by-planet friendship table', () => {
  // The planet table (shared/constants PLANET_FRIENDS / PLANET_ENEMIES) gives:
  //   Moon: friends Sun, Mercury; no enemies      -> Venus' and Saturn's signs are neutral
  //   Mercury: friends Sun, Venus; enemy Moon     -> Mars' signs neutral, Saturn's signs neutral
  //   Venus: friends Mercury, Saturn; enemies Sun, Moon -> Mars' signs neutral
  //   Saturn: friends Mercury, Venus; enemies Sun, Moon, Mars -> Jupiter's signs neutral
  // The old sign table in astro-tools/transit.ts said otherwise for each of these.
  const dignity = (planet: string, signIndex: number) =>
    dashaLordTransitQuality(planet, signIndex).dignity;

  it('Moon in Libra and in Capricorn is neutral', () => {
    expect(dignity('Moon', 6)).toBe('neutral');
    expect(dignity('Moon', 9)).toBe('neutral');
  });

  it('Mercury in Aries and in Capricorn is neutral', () => {
    expect(dignity('Mercury', 0)).toBe('neutral');
    expect(dignity('Mercury', 9)).toBe('neutral');
  });

  it('Venus in Aries is neutral; Saturn in Sagittarius and Pisces is neutral', () => {
    expect(dignity('Venus', 0)).toBe('neutral');
    expect(dignity('Saturn', 8)).toBe('neutral');
    expect(dignity('Saturn', 11)).toBe('neutral');
  });

  it('the cells both tables agreed on are unchanged', () => {
    expect(dignity('Sun', 0)).toBe('exalted');
    expect(dignity('Sun', 6)).toBe('debilitated');
    expect(dignity('Jupiter', 8)).toBe('own');
    expect(dignity('Sun', 8)).toBe('friend'); // Jupiter's sign
    expect(dignity('Sun', 9)).toBe('enemy'); // Saturn's sign
    expect(dashaLordTransitQuality('Sun', 0).qualityScore).toBe(5);
    expect(dashaLordTransitQuality('Sun', 9).qualityScore).toBe(1);
  });
});

describe('[TJ4] the solar return is found in the chart’s own ayanamsa', () => {
  it('for a Raman-ayanamsa chart the returning Sun matches the natal Sun', async () => {
    // Born 20 May 1990 01:00 UT. Take the natal Sun in the Raman ayanamsa, find
    // the 2025 return, and read the Sun there in the same ayanamsa: it must be
    // back on the natal longitude. Reading the transit Sun in Lahiri instead
    // leaves it about 1.4 degrees (a day and a half) away.
    const birth = new Date(Date.UTC(1990, 4, 20, 1, 0));
    const birthJd = await dateToJulianDay(1990, 5, 20, 1, 0, 0);
    const natalSun = (await calculatePlanetPositions(birthJd, 'raman')).find(
      (p) => p.planet === 'Sun',
    )!.longitude;

    const jd = await findSolarReturnJd(natalSun, birth, 2025, 'raman');
    const returnSun = (await calculatePlanetPositions(jd, 'raman')).find(
      (p) => p.planet === 'Sun',
    )!.longitude;

    expect(Math.abs(returnSun - natalSun)).toBeLessThan(0.001);
  }, 60_000);
});

describe('[RC1] rectification candidates that cross midnight change the date', () => {
  it('a 00:10 birth searched an hour either side casts 23:10 on the previous day', async () => {
    vi.resetModules();
    const cast: Array<{ day: number; hour: number; minute: number }> = [];
    vi.doMock('../../src/lib/astro-engine/calculations/planetPositions.js', () => ({
      calculateChart: (_y: number, _m: number, day: number, hour: number, minute: number) => {
        cast.push({ day, hour, minute });
        return Promise.resolve({
          planets: [{ planet: 'Moon', longitude: 10, house: 1 }],
          houses: [],
          ascendant: { sign: 'Aries' },
        });
      },
    }));
    const { rectifyBirthTime } =
      await import('../../src/lib/astro-engine/calculations/rectification.js');
    await rectifyBirthTime({
      year: 1990,
      month: 5,
      day: 20,
      hour: 0,
      minute: 10,
      tzOffset: 5.5,
      lat: 19,
      lng: 72.8,
      events: [
        { date: '2015-01-01', domain: 'marriage' },
        { date: '2018-01-01', domain: 'childbirth' },
        { date: '2012-01-01', domain: 'job_started' },
      ],
      windowMinutes: 60,
      stepMinutes: 60,
    });
    vi.doUnmock('../../src/lib/astro-engine/calculations/planetPositions.js');

    expect(cast).toEqual([
      { day: 19, hour: 23, minute: 10 },
      { day: 20, hour: 0, minute: 10 },
      { day: 20, hour: 1, minute: 10 },
    ]);
  });
});
