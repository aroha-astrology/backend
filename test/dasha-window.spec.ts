import { describe, expect, it } from 'vitest';
import { findFavorableWindow } from '../src/lib/dasha-window.js';

/** Build a minimal synthetic mahadasha sequence starting from `now`. */
function makeDasha(now: Date) {
  const planets = ['Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus'];
  const years: Record<string, number> = {
    Sun: 6,
    Moon: 10,
    Mars: 7,
    Rahu: 18,
    Jupiter: 16,
    Saturn: 19,
    Mercury: 17,
    Ketu: 7,
    Venus: 20,
  };
  let cursor = new Date(now.getTime());
  const mahadashas = planets.map((planet) => {
    const startDate = new Date(cursor.getTime());
    const endDate = new Date(cursor.getTime() + years[planet]! * 365.25 * 86_400_000);
    cursor = endDate;
    return {
      planet,
      startDate,
      endDate,
      isActive: false,
      level: 'mahadasha' as const,
      subPeriods: [],
    };
  });
  mahadashas[0]!.isActive = true;
  return { vimshottari: { mahadashas } };
}

describe('findFavorableWindow', () => {
  it('finds the nearest antardasha ruled by a significator planet', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    // Sun mahadasha's own antardasha cycle starts with Sun, then Moon, Mars, Rahu, Jupiter...
    // Venus is a significator here — it will appear as an antardasha within the Sun mahadasha.
    const result = findFavorableWindow(dasha, ['Venus'], now);
    expect(result).toBeDefined();
    expect(result!.lord).toBe('Venus');
    expect(result!.level).toBe('antardasha');
    expect(result!.withinMahadasha).toBe('Sun');
  });

  it('returns undefined when nothing matches within the lookahead window', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const result = findFavorableWindow(dasha, ['NotAPlanet'], now);
    expect(result).toBeUndefined();
  });

  it('returns undefined when dasha data is missing', () => {
    const result = findFavorableWindow(null, ['Venus'], new Date());
    expect(result).toBeUndefined();
  });
});
