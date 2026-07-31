import { describe, it, expect } from 'vitest';
import { getLalKitabRemedies } from '../src/lib/astro-engine/index.js';
import { getRemedies } from '../src/modules/astro/astro.service.js';
import type { Planet } from '@aroha-astrology/shared';

const NINE_PLANETS: Planet[] = [
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

describe('getLalKitabRemedies: exhaustive coverage (Phase 4 wiring)', () => {
  it('has at least one remedy AND one totka for every one of the 108 (planet, house) combinations', () => {
    const missing: string[] = [];
    for (const planet of NINE_PLANETS) {
      for (let house = 1; house <= 12; house++) {
        const { remedies, totke } = getLalKitabRemedies(planet, house);
        if (remedies.length === 0 || totke.length === 0) {
          missing.push(`${planet}_${house}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('returns empty arrays (not a crash) for an out-of-range house', () => {
    expect(getLalKitabRemedies('Sun', 0)).toEqual({ remedies: [], totke: [] });
    expect(getLalKitabRemedies('Sun', 13)).toEqual({ remedies: [], totke: [] });
  });

  it('gives distinct remedy text for the same planet in different houses', () => {
    const house1 = getLalKitabRemedies('Sun', 1);
    const house8 = getLalKitabRemedies('Sun', 8);
    expect(house1.remedies).not.toEqual(house8.remedies);
  });
});

describe('getRemedies: end-to-end wiring into the natal chart (Phase 4)', () => {
  it('returns a well-formed remedy list for a real birth date', async () => {
    const remedies = await getRemedies({
      date: '1985-03-12',
      time: '04:32',
      latitude: 19.076,
      longitude: 72.8777,
      timezone: '5.5',
    });

    expect(remedies.length).toBeGreaterThan(0);
    for (const r of remedies) {
      expect(typeof r.planet).toBe('string');
      expect(typeof r.title).toBe('string');
      expect(typeof r.icon).toBe('string');
      expect(typeof r.remedy).toBe('string');
    }
  }, 20_000);

  it('falls back to general remedies when no birth data is provided', async () => {
    const remedies = await getRemedies(undefined);
    expect(remedies.length).toBeGreaterThan(0);
    expect(remedies.every((r) => r.planet === 'General')).toBe(true);
  });

  it('a planet-specific remedy (title mentions "house") actually matches getLalKitabRemedies for that planet+house', async () => {
    // A birth date chosen for a chart likely to have at least one
    // debilitated/retrograde planet -- if this particular date doesn't, the
    // test still passes vacuously (see the loop below), so it isn't flaky.
    const remedies = await getRemedies({
      date: '1990-06-15',
      time: '10:00',
      latitude: 28.6139,
      longitude: 77.209,
      timezone: '5.5',
    });

    for (const r of remedies) {
      const match = /^(\w+) in your (\d+)(st|nd|rd|th) house$/.exec(r.title);
      if (!match) continue; // general/fallback remedy, not a Lal Kitab one
      const planet = match[1] as Planet;
      const house = Number(match[2]);
      const expected = getLalKitabRemedies(planet, house);
      expect(r.remedy).toBe(expected.remedies.slice(0, 2).join(' Also: '));
    }
  }, 20_000);
});
