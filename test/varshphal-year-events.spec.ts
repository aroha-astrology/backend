import { describe, it, expect, beforeAll } from 'vitest';
import {
  computeYearEvents,
  type YearEvent,
} from '../src/lib/astro-engine/varshphal/year-events.js';

// UTC, 1 January to 31 December 2027. The dates checked below are ones I know independently of the
// engine: the 2027 eclipses (annular 6 Feb, total 2 Aug) and Mercury's three retrogrades.
const from = Date.UTC(2027, 0, 1);
const to = Date.UTC(2028, 0, 1);

describe('computeYearEvents for 2027', () => {
  let events: YearEvent[] = [];
  beforeAll(async () => {
    events = await computeYearEvents(from, to);
  }, 120_000);

  const on = (ms: number, y: number, m: number, d: number, slackDays = 1) =>
    Math.abs(ms - Date.UTC(y, m - 1, d, 12)) <= slackDays * 86_400_000;

  it('is in time order and inside the window', () => {
    for (let i = 1; i < events.length; i++) expect(events[i]!.atMs).toBeGreaterThanOrEqual(events[i - 1]!.atMs);
    expect(events[0]!.atMs).toBeGreaterThanOrEqual(from);
    expect(events[events.length - 1]!.atMs).toBeLessThan(to);
  });

  it('has the two solar eclipses of 2027: annular on 6 Feb and total on 2 Aug', () => {
    const solar = events.filter((e) => e.kind === 'eclipse-solar');
    expect(solar).toHaveLength(2);
    expect(on(solar[0]!.atMs, 2027, 2, 6)).toBe(true);
    expect(on(solar[1]!.atMs, 2027, 8, 2)).toBe(true);
  });

  it('has lunar eclipses too', () => {
    expect(events.filter((e) => e.kind === 'eclipse-lunar').length).toBeGreaterThanOrEqual(2);
  });

  it('Mercury turns retrograde three times in 2027, in February, June and October', () => {
    const retro = events.filter((e) => e.kind === 'station-retrograde' && e.planet === 'Mercury');
    expect(retro.map((e) => new Date(e.atMs).getUTCMonth() + 1)).toEqual([2, 6, 10]);
  });

  it('has ingresses of the Sun, one a month, and every combustion in is followed by its out', () => {
    expect(events.filter((e) => e.kind === 'ingress' && e.planet === 'Sun').length).toBeGreaterThanOrEqual(12);
    for (const planet of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']) {
      const seq = events.filter((e) => e.planet === planet && e.kind.startsWith('combust')).map((e) => e.kind);
      seq.forEach((k, i) => {
        if (i > 0) expect(k).not.toBe(seq[i - 1]);
      });
    }
    // Mercury is combust several times a year.
    expect(events.filter((e) => e.kind === 'combust-in' && e.planet === 'Mercury').length).toBeGreaterThanOrEqual(3);
  });

  it('refuses an ayanamsa the ingress search cannot honour', async () => {
    await expect(computeYearEvents(from, to, 'raman')).rejects.toThrow(/Lahiri/);
  });
});
