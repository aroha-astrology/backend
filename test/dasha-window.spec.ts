import { describe, expect, it } from 'vitest';
import { findFavorableWindows } from '../src/lib/dasha-window.js';

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

describe('findFavorableWindows', () => {
  it('finds the antardasha ruled by a significator planet', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    // Sun mahadasha's own antardasha cycle starts with Sun, then Moon, Mars, Rahu, Jupiter...
    // Venus is a significator here — it will appear as an antardasha within the Sun mahadasha.
    const results = findFavorableWindows(dasha, ['Venus'], now);
    const antardashaMatch = results.find((r) => r.level === 'antardasha');
    expect(antardashaMatch).toBeDefined();
    expect(antardashaMatch!.lord).toBe('Venus');
    expect(antardashaMatch!.withinMahadasha).toBe('Sun');
  });

  it('returns an empty array when nothing matches within the lookahead window', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const results = findFavorableWindows(dasha, ['NotAPlanet'], now);
    expect(results).toEqual([]);
  });

  it('returns an empty array when dasha data is missing', () => {
    const results = findFavorableWindows(null, ['Venus'], new Date());
    expect(results).toEqual([]);
  });

  it('collects a match at BOTH antardasha and nested-pratyantardasha depth, not just the first found', () => {
    // Venus is antardasha #9 (last) within Sun's mahadasha (Sun, Moon, Mars,
    // Rahu, Jupiter, Saturn, Mercury, Ketu, Venus), spanning years 5-6 of the
    // mahadasha. Venus ALSO appears as the last (9th) pratyantardasha nested
    // inside Sun's own antardasha — the very first antardasha, spanning only
    // the first ~0.3 years. `findFavorableWindows` now collects every match
    // in the lookahead rather than stopping at the first one; which of these
    // should be treated as "the" answer is `scoreDomainWindows`'s job (see
    // dasha-confidence.spec.ts), not this collection step's.
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const results = findFavorableWindows(dasha, ['Venus'], now);

    const antardashaMatch = results.find((r) => r.level === 'antardasha');
    const pratyantardashaMatch = results.find((r) => r.level === 'pratyantardasha');
    expect(antardashaMatch).toBeDefined();
    expect(pratyantardashaMatch).toBeDefined();

    const sunMahadasha = dasha.vimshottari.mahadashas[0]!;
    expect(antardashaMatch!.endDate).toBe(sunMahadasha.endDate.toISOString().slice(0, 10));
    const expectedStart = new Date(now.getTime() + 5 * 365.25 * 86_400_000);
    expect(antardashaMatch!.startDate).toBe(expectedStart.toISOString().slice(0, 10));

    // Despite being chronologically much later, the antardasha-level match
    // sorts FIRST — antardasha always outranks pratyantardasha, deliberately
    // NOT a chronological sort (see the comment on this in dasha-window.ts;
    // a naive chronological sort was the actual bug this test caught).
    expect(results[0]).toBe(antardashaMatch);
  });

  it('finds a match that only exists at pratyantardasha depth WITHIN the originating mahadasha, even though a later mahadasha also has its own antardasha-level match', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    // Fast-forward "now" to 1 year into the Sun mahadasha. By then, Moon's
    // own antardasha (the 2nd of Sun mahadasha's 9 antardashas, ending at
    // ~0.8 years) has already elapsed, and each planet is an antardasha
    // lord exactly once per mahadasha cycle -- so Moon can never match at
    // antardasha level again WITHIN SUN'S MAHADASHA. But Moon DOES reoccur
    // as the last (9th) pratyantardasha nested inside the next antardasha,
    // Mars (whose own sub-cycle is Mars, Rahu, Jupiter, Saturn, Mercury,
    // Ketu, Venus, Sun, Moon), which is still in progress at the 1-year mark.
    //
    // Separately, since the lookahead spans 3 mahadashas (Sun's remainder,
    // then Moon's own, then Mars's), Moon ALSO has a genuine antardasha-level
    // self-match as the very first antardasha of its own upcoming mahadasha
    // -- collecting across the full lookahead (not stopping at first match)
    // is exactly what distinguishes this plural function from the old
    // singular one, so this test asserts both facts are found and ranked
    // correctly (antardasha-level self-match first, despite the
    // pratyantardasha-level Sun-mahadasha match being chronologically first).
    const laterNow = new Date(now.getTime() + 1 * 365.25 * 86_400_000);

    const results = findFavorableWindows(dasha, ['Moon'], laterNow);
    expect(results.length).toBeGreaterThan(0);

    const withinSun = results.filter((r) => r.withinMahadasha === 'Sun');
    expect(withinSun.length).toBeGreaterThan(0);
    expect(withinSun.every((r) => r.level === 'pratyantardasha')).toBe(true);

    const ownAntardasha = results.find(
      (r) => r.level === 'antardasha' && r.withinMahadasha === 'Moon',
    );
    expect(ownAntardasha).toBeDefined();
    expect(results[0]).toBe(ownAntardasha);
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
    const results = findFavorableWindows(dasha, ['Mars'], now2);
    const antardashaMatch = results.find((r) => r.level === 'antardasha');
    expect(antardashaMatch).toBeDefined();
    expect(antardashaMatch!.lord).toBe('Mars');
    expect(antardashaMatch!.withinMahadasha).toBe('Moon');
  });
});
