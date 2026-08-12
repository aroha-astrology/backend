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
    const { remedies } = await getRemedies({
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

  it('covers all nine classical planets, not only the debilitated/retrograde ones', async () => {
    // The old weak-planets-only filter returned 2-4 cards for a typical
    // chart. Lal Kitab prescribes per placement, so every planet must appear.
    const { remedies } = await getRemedies({
      date: '1985-03-12',
      time: '04:32',
      latitude: 19.076,
      longitude: 72.8777,
      timezone: '5.5',
    });

    expect(remedies.map((r) => r.planet).sort()).toEqual([...NINE_PLANETS].sort());
  }, 20_000);

  it('returns the FULL remedy and totka lists, never a two-item "Also:" summary', async () => {
    const { remedies } = await getRemedies({
      date: '1985-03-12',
      time: '04:32',
      latitude: 19.076,
      longitude: 72.8777,
      timezone: '5.5',
    });

    for (const r of remedies) {
      if (r.natalHouse === undefined) continue; // general/fallback entry
      const expected = getLalKitabRemedies(r.planet as Planet, r.natalHouse);
      expect(r.remedies).toEqual(expected.remedies);
      expect(r.totke).toEqual(expected.totke);
      expect(r.totke?.length).toBeGreaterThan(0);
    }

    // The stray "Also:" the old join produced must not survive anywhere.
    expect(JSON.stringify(remedies)).not.toContain(' Also: ');
  }, 20_000);

  it('falls back to general remedies when no birth data is provided', async () => {
    const { remedies, debts } = await getRemedies(undefined);
    expect(remedies.length).toBeGreaterThan(0);
    expect(remedies.every((r) => r.planet === 'General')).toBe(true);
    expect(debts).toEqual([]);
  });

  it('returns only karmic debts that are actually present', async () => {
    const { debts } = await getRemedies({
      date: '1990-06-15',
      time: '10:00',
      latitude: 28.6139,
      longitude: 77.209,
      timezone: '5.5',
    });

    expect(Array.isArray(debts)).toBe(true);
    expect(debts.length).toBeLessThanOrEqual(8);
    for (const d of debts) {
      expect(d.present).toBe(true);
      expect(d.remedies.length).toBeGreaterThan(0);
    }
  }, 20_000);
});
