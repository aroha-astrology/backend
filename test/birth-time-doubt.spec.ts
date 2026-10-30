import { describe, it, expect } from 'vitest';
import { birthTimeDoubt, birthTimeDoubtFacts } from '../src/lib/birth-time-doubt.js';
import { calculatePlanetPositions } from '../src/lib/astro-engine/calculations/planetPositions.js';

/**
 * Sprint 3 / H3: for a reader with no birth time the chart is cast for one time inside a
 * part-of-day window, so the Moon sign and birth star are only as good as the Moon staying
 * put across the whole window. These tests build a chart whose Moon is placed on purpose
 * (a chart is only `planets[]` + `julianDay` for this module) and check the two ends.
 */

const JD_2000 = 2451545; // any instant; the module only needs it for the birth date

function chartWithMoon(longitude: number, speed = 13): Record<string, unknown> {
  return {
    julianDay: JD_2000,
    planets: [{ planet: 'Moon', longitude, speed }],
  };
}

describe('birthTimeDoubt: the Moon at both ends of the real window', () => {
  it('finds a sign change inside a 6 hour window (29.9 degrees Aries, moving 13 deg/day)', () => {
    // Morning is 06:00-12:00 and the chart sits at 09:00, so the window is -3h/+3h.
    const doubt = birthTimeDoubt(chartWithMoon(29.9), '09:00')!;
    expect(doubt.signDiffers).toBe(true);
    expect(doubt.start.sign).toBe('Aries');
    expect(doubt.end.sign).toBe('Taurus');
    expect(doubt.candidates.map((c) => c.sign)).toEqual(['Aries', 'Taurus']);
    // 6 hours x 13 deg/day = 3.25 degrees across the window
    expect(doubt.spanDegrees).toBeCloseTo(3.25, 2);
  });

  it('finds a nakshatra change that is not a sign change (13 degrees Aries, afternoon window)', () => {
    // Afternoon is 12:00-16:00, chart at 14:00: +-2h = +-1.08 degrees around 13.0 -> 11.9..14.1
    const doubt = birthTimeDoubt(chartWithMoon(13.0), '14:00')!;
    expect(doubt.signDiffers).toBe(false);
    expect(doubt.nakshatraDiffers).toBe(true);
    expect(doubt.candidates.map((c) => c.nakshatra)).toEqual(['Ashwini', 'Bharani']);
  });

  it('reports one candidate when the Moon stays in the same sign and star', () => {
    const doubt = birthTimeDoubt(chartWithMoon(20), '09:00')!;
    expect(doubt.signDiffers).toBe(false);
    expect(doubt.nakshatraDiffers).toBe(false);
    expect(doubt.candidates).toHaveLength(1);
  });

  it('uses the stored window, not a fixed +-3h: a 3 hour window around 01:30 only spans 1.5h each side', () => {
    // late_night = 00:00-03:00. Moon at 29.9 moves 0.8125 deg to the end of the window (1.5h)
    // and back to 29.09 at the start - so it stays in Aries on both ends.
    const doubt = birthTimeDoubt(chartWithMoon(29.0), '01:30')!;
    expect(doubt.spanDegrees).toBeCloseTo(1.625, 2);
    expect(doubt.signDiffers).toBe(false);
  });

  it('measures the window from the stored clock time, so a typed 10:15 in the morning window is -4.25h/+1.75h', () => {
    // Legacy rows kept the typed time. Moon at 29.0 -> end of window is 29.0 + 1.75h*13/24 = 29.95: still Aries.
    // Moon at 29.2 -> 30.15: Taurus. Start (-4.25h) is 26.9 either way.
    expect(birthTimeDoubt(chartWithMoon(29.0), '10:15')!.signDiffers).toBe(false);
    const crossing = birthTimeDoubt(chartWithMoon(29.2), '10:15')!;
    expect(crossing.signDiffers).toBe(true);
    expect(crossing.start.longitude).toBeCloseTo(29.2 - (4.25 * 13) / 24, 3);
    expect(crossing.end.longitude).toBeCloseTo(29.2 + (1.75 * 13) / 24, 3);
  });

  it('returns null without a Moon or without a usable time', () => {
    expect(birthTimeDoubt({ planets: [] }, '09:00')).toBeNull();
    expect(birthTimeDoubt(chartWithMoon(10), null)).toBeNull();
    expect(birthTimeDoubt(null, '09:00')).toBeNull();
  });

  it('gives the dasha margin per birth dasha lord: span / 13.333 degrees x the lord years', () => {
    // Moon 20.0 degrees is Bharani (13.33-26.67), lord Venus (20 years).
    // Morning window at 09:00: -3h/+3h -> +-1.625 degrees -> 1.625/13.3333*20 = 2.44 years.
    const doubt = birthTimeDoubt(chartWithMoon(20), '09:00')!;
    expect(doubt.birthDashaLord).toBe('Venus');
    expect(doubt.dashaMarginYears).toBeCloseTo(2.44, 1);
  });

  it('agrees with the real ephemeris at the window ends (straight-line Moon is good to 0.02 degrees)', async () => {
    const jd = 2461000.25; // a 2026 instant
    const [at, ahead, behind] = await Promise.all([
      calculatePlanetPositions(jd),
      calculatePlanetPositions(jd + 3 / 24),
      calculatePlanetPositions(jd - 3 / 24),
    ]);
    const moon = at.find((p) => p.planet === 'Moon')!;
    const chart = {
      julianDay: jd,
      planets: [{ planet: 'Moon', longitude: moon.longitude, speed: moon.speed }],
    };
    const doubt = birthTimeDoubt(chart, '09:00')!;
    expect(doubt.end.longitude).toBeCloseTo(ahead.find((p) => p.planet === 'Moon')!.longitude, 1);
    expect(doubt.start.longitude).toBeCloseTo(
      behind.find((p) => p.planet === 'Moon')!.longitude,
      1,
    );
  });
});

describe('birthTimeDoubtFacts: what the model is told', () => {
  const asOf = new Date('2026-10-30T06:00:00Z');

  it('names BOTH Moon signs, both Sade Sati/Dhaiya states and both dasha starts, and says not to pick one', async () => {
    // Moon at 29.9 Aries / Taurus. Saturn is in Pisces in Oct 2026, so an Aries Moon is in Sade Sati
    // (Saturn in the 12th from the Moon) and a Taurus Moon is not.
    const facts = await birthTimeDoubtFacts(chartWithMoon(29.9), '09:00', { asOf });
    const text = facts.join('\n');
    expect(text).toMatch(/Aries or Taurus/);
    expect(text).toMatch(/If the Moon is in Aries/);
    expect(text).toMatch(/If the Moon is in Taurus/);
    expect(text).toMatch(/Sade Sati/);
    expect(text).toMatch(/dasha/i);
    expect(text).toMatch(/do not pick one|Do not pick one/);
  });

  it('writes the Sade Sati and Dhaiya years as plain years (the engine returns Date objects)', async () => {
    const facts = await birthTimeDoubtFacts(chartWithMoon(29.9), '09:00', { asOf });
    const text = facts.join('\n');
    // Aries Moon, Saturn in Pisces = 12th from the Moon: rising Sade Sati, running 2025 to 2028
    expect(text).toMatch(/Sade Sati ACTIVE \([a-z]+ phase, running \d{4} to \d{4}\)/);
    expect(text).not.toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat) /); // a Date turned into text starts "Sat Mar 29 ..."
  });

  it('says so once when both readings give the same Mahadasha today, instead of listing it twice', async () => {
    // 19 Mar 1990 09:00 IST Delhi: Moon 239.44 degrees, speed 12.06 - Scorpio/Jyeshtha or Sagittarius/Moola
    const chart = {
      julianDay: 2447969.6458333335,
      planets: [{ planet: 'Moon', longitude: 239.44, speed: 12.06 }],
    };
    const facts = await birthTimeDoubtFacts(chart, '09:00', { asOf });
    const text = facts.join('\n');
    expect(text).toMatch(/Mahadasha today is [A-Za-z]+ on either reading/);
    expect(text).not.toMatch(/Mahadasha today would be/);
  });

  it('names both birth stars and their different dasha starting planets when only the nakshatra differs', async () => {
    const facts = await birthTimeDoubtFacts(chartWithMoon(13.0), '14:00', { asOf });
    const text = facts.join('\n');
    expect(text).toMatch(/Ashwini/);
    expect(text).toMatch(/Bharani/);
    expect(text).toMatch(/Ketu/);
    expect(text).toMatch(/Venus/);
    // sign is the same on both, so no sign split
    expect(text).not.toMatch(/Aries or /);
  });

  it('always states the dasha margin and forbids pratyantardasha and day-level dasha dates', async () => {
    const facts = await birthTimeDoubtFacts(chartWithMoon(20), '09:00', { asOf });
    const text = facts.join('\n');
    expect(text).toMatch(/about 2\.4 years/);
    expect(text).toMatch(/pratyantardasha|sub-minor/i);
    expect(text).toMatch(/Moon sign and birth star are the same across the whole window/);
    // no candidate split when nothing crosses
    expect(text).not.toMatch(/If the Moon is in/);
  });

  it('returns nothing when the chart has no Moon', async () => {
    expect(await birthTimeDoubtFacts({ planets: [] }, '09:00', { asOf })).toEqual([]);
  });
});
