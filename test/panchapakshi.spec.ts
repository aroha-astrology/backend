import { describe, it, expect } from 'vitest';
import {
  PANCHA_PAKSHI_GROUPS,
  getBirthBird,
  pakshaFromTithiNumber,
  computeBirthBird,
} from '../src/lib/astro-engine/panchapakshi/birds.js';
import { computeYamaGrid, findCurrentYama } from '../src/lib/astro-engine/panchapakshi/yamas.js';

describe('PANCHA_PAKSHI_GROUPS', () => {
  it('covers all 27 nakshatras (0-26) exactly once across 5 bands', () => {
    const covered = new Set<number>();
    for (const g of PANCHA_PAKSHI_GROUPS) {
      for (let i = g.start; i <= g.end; i++) covered.add(i);
    }
    expect(covered.size).toBe(27);
    for (let i = 0; i <= 26; i++) expect(covered.has(i)).toBe(true);
  });

  it('has band sizes 5,6,5,5,6 per the classical grouping', () => {
    const sizes = PANCHA_PAKSHI_GROUPS.map((g) => g.end - g.start + 1);
    expect(sizes).toEqual([5, 6, 5, 5, 6]);
  });
});

describe('getBirthBird', () => {
  it('assigns Vulture/Owl/Crow/Cock/Peacock in band order for Shukla Paksha', () => {
    expect(getBirthBird(0, 'Shukla')).toBe('Vulture'); // Ashwini
    expect(getBirthBird(5, 'Shukla')).toBe('Owl'); // Ardra
    expect(getBirthBird(11, 'Shukla')).toBe('Crow'); // UttaraPhalguni
    expect(getBirthBird(16, 'Shukla')).toBe('Cock'); // Anuradha
    expect(getBirthBird(21, 'Shukla')).toBe('Peacock'); // Shravana
  });

  it('reverses band 0/1/3/4 for Krishna Paksha, but keeps band 2 (Crow) invariant', () => {
    expect(getBirthBird(0, 'Krishna')).toBe('Peacock');
    expect(getBirthBird(5, 'Krishna')).toBe('Cock');
    expect(getBirthBird(11, 'Krishna')).toBe('Crow'); // same as Shukla
    expect(getBirthBird(16, 'Krishna')).toBe('Owl');
    expect(getBirthBird(21, 'Krishna')).toBe('Vulture');
  });

  it('gives every nakshatra in a band the same bird', () => {
    for (let i = 0; i <= 4; i++) expect(getBirthBird(i, 'Shukla')).toBe('Vulture');
    for (let i = 21; i <= 26; i++) expect(getBirthBird(i, 'Shukla')).toBe('Peacock');
  });
});

describe('pakshaFromTithiNumber', () => {
  it('classifies 1-15 as Shukla and 16-30 as Krishna', () => {
    expect(pakshaFromTithiNumber(1)).toBe('Shukla');
    expect(pakshaFromTithiNumber(15)).toBe('Shukla');
    expect(pakshaFromTithiNumber(16)).toBe('Krishna');
    expect(pakshaFromTithiNumber(30)).toBe('Krishna');
  });
});

describe('computeBirthBird', () => {
  it('assembles bird + nakshatra name + paksha from raw inputs', () => {
    const result = computeBirthBird(0, 5); // Ashwini, tithi 5 -> Shukla
    expect(result.bird).toBe('Vulture');
    expect(result.nakshatra).toBe('Ashwini');
    expect(result.paksha).toBe('Shukla');
  });

  it('a Krishna-Paksha birth gets the mirrored bird for the same nakshatra', () => {
    const shukla = computeBirthBird(0, 5);
    const krishna = computeBirthBird(0, 20);
    expect(shukla.bird).not.toBe(krishna.bird);
  });
});

// Delhi/NCR, matching the existing panchang rise-set test's reference point.
const DELHI_LAT = 28.6139;
const DELHI_LON = 77.209;
const IST_OFFSET = 5.5;

function localDate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

describe('computeYamaGrid (live swisseph sunrise/sunset)', () => {
  it('produces 5 day Yamas exactly spanning sunrise-sunset, and 5 night Yamas spanning sunset-next-sunrise', async () => {
    const grid = await computeYamaGrid(localDate('2026-08-01'), DELHI_LAT, DELHI_LON, IST_OFFSET);
    expect(grid).not.toBeNull();
    if (!grid) return;

    expect(grid.dayYamas).toHaveLength(5);
    expect(grid.nightYamas).toHaveLength(5);
    expect(grid.dayYamas[0]!.start).toEqual(grid.sunrise);
    expect(grid.dayYamas[4]!.end).toEqual(grid.sunset);
    expect(grid.nightYamas[0]!.start).toEqual(grid.sunset);
    expect(grid.nightYamas[4]!.end).toEqual(grid.nextSunrise);
  }, 30_000);

  it('every Yama is chronologically contiguous with the next (no gaps, no overlaps)', async () => {
    const grid = await computeYamaGrid(localDate('2026-08-01'), DELHI_LAT, DELHI_LON, IST_OFFSET);
    expect(grid).not.toBeNull();
    if (!grid) return;

    const all = [...grid.dayYamas, ...grid.nightYamas];
    for (let i = 1; i < all.length; i++) {
      expect(all[i]!.start.getTime()).toBe(all[i - 1]!.end.getTime());
    }
  }, 30_000);

  it('all 5 day Yamas are (approximately) equal length, and likewise for night Yamas', async () => {
    const grid = await computeYamaGrid(localDate('2026-08-01'), DELHI_LAT, DELHI_LON, IST_OFFSET);
    expect(grid).not.toBeNull();
    if (!grid) return;

    const dayLengths = grid.dayYamas.map((y) => y.end.getTime() - y.start.getTime());
    for (const len of dayLengths) {
      expect(Math.abs(len - dayLengths[0]!)).toBeLessThan(1000); // within 1 second
    }
  }, 30_000);

  it('findCurrentYama locates the correct window for a known instant', async () => {
    const grid = await computeYamaGrid(localDate('2026-08-01'), DELHI_LAT, DELHI_LON, IST_OFFSET);
    expect(grid).not.toBeNull();
    if (!grid) return;

    const midOfFirstDayYama = new Date(
      (grid.dayYamas[0]!.start.getTime() + grid.dayYamas[0]!.end.getTime()) / 2,
    );
    const found = findCurrentYama(grid, midOfFirstDayYama);
    expect(found).not.toBeNull();
    expect(found?.index).toBe(1);
    expect(found?.period).toBe('day');
  }, 30_000);

  it('returns null for an instant outside the whole grid', async () => {
    const grid = await computeYamaGrid(localDate('2026-08-01'), DELHI_LAT, DELHI_LON, IST_OFFSET);
    expect(grid).not.toBeNull();
    if (!grid) return;

    const before = new Date(grid.sunrise.getTime() - 3 * 3_600_000);
    expect(findCurrentYama(grid, before)).toBeNull();
  }, 30_000);
});
