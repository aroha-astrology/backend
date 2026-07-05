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

  it('regression: an antardasha-level match must outrank an earlier nested pratyantardasha match in the same mahadasha', () => {
    // This is the exact scenario that exposed the original bug: the draft
    // implementation checked each antardasha's own pratyantardashas
    // immediately after checking the antardasha itself, instead of
    // completing a full antardasha-level scan first. Venus is antardasha
    // #9 (last) within Sun's mahadasha (Sun, Moon, Mars, Rahu, Jupiter,
    // Saturn, Mercury, Ketu, Venus), spanning years 5-6 of the mahadasha.
    // But Venus ALSO appears as the last (9th) pratyantardasha nested
    // inside Sun's own antardasha -- the very first antardasha, spanning
    // only the first ~0.3 years. That nested pratyantardasha match is
    // chronologically much sooner, so a buggy interleaved scan returns it
    // instead of continuing on to the real antardasha-level match.
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const result = findFavorableWindow(dasha, ['Venus'], now);
    expect(result).toBeDefined();
    expect(result!.level).toBe('antardasha');
    expect(result!.lord).toBe('Venus');
    expect(result!.withinMahadasha).toBe('Sun');

    // Pin down the actual dates so this test can't pass by merely matching
    // on lord name: the antardasha-level window must end when the Sun
    // mahadasha itself ends (~6 years out), not at the ~0.3-year mark
    // where the erroneous nested pratyantardasha match would fall.
    const sunMahadasha = dasha.vimshottari.mahadashas[0]!;
    expect(result!.endDate).toBe(sunMahadasha.endDate.toISOString().slice(0, 10));
    const expectedStart = new Date(now.getTime() + 5 * 365.25 * 86_400_000);
    expect(result!.startDate).toBe(expectedStart.toISOString().slice(0, 10));
  });

  it('finds a match that only exists at pratyantardasha depth', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    // Fast-forward "now" to 1 year into the Sun mahadasha. By then, Moon's
    // own antardasha (the 2nd of Sun mahadasha's 9 antardashas, ending at
    // ~0.8 years) has already elapsed, and each planet is an antardasha
    // lord exactly once per mahadasha cycle -- so Moon can never match at
    // antardasha level again within this mahadasha. But Moon DOES reoccur
    // as the last (9th) pratyantardasha nested inside the next antardasha,
    // Mars (whose own sub-cycle is Mars, Rahu, Jupiter, Saturn, Mercury,
    // Ketu, Venus, Sun, Moon), which is still in progress at the 1-year mark.
    const laterNow = new Date(now.getTime() + 1 * 365.25 * 86_400_000);

    const result = findFavorableWindow(dasha, ['Moon'], laterNow);
    expect(result).toBeDefined();
    expect(result!.level).toBe('pratyantardasha');
    expect(result!.lord).toBe('Moon');
    expect(result!.withinMahadasha).toBe('Sun');
  });

  it('finds a match in a later mahadasha once the current one is exhausted', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const sunMahadasha = dasha.vimshottari.mahadashas[0]!;
    // Jump "now" to exactly when the Sun mahadasha ends, so it's filtered
    // out of the lookahead window entirely and the search must advance to
    // the next mahadasha (Moon) to find a match -- exercising the outer
    // loop actually moving forward instead of only ever inspecting the
    // first mahadasha in the list.
    const now2 = new Date(sunMahadasha.endDate.getTime());

    // Mars is the 2nd antardasha within Moon's own cycle (Moon, Mars,
    // Rahu, Jupiter, Saturn, Mercury, Ketu, Venus, Sun), so it's found
    // almost immediately once the search reaches the Moon mahadasha.
    const result = findFavorableWindow(dasha, ['Mars'], now2);
    expect(result).toBeDefined();
    expect(result!.level).toBe('antardasha');
    expect(result!.lord).toBe('Mars');
    expect(result!.withinMahadasha).toBe('Moon');
  });
});
