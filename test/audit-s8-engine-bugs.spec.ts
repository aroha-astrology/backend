import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { tzOffsetHours } from '../src/modules/kundli/kundli.service.js';
import { avoidFlags } from '../src/lib/astro-tools/decision-engine.js';
import type { DaySky } from '../src/lib/astro-tools/decision-engine.js';
import { isCombust } from '../src/lib/astro-engine/calculations/planet-state.js';
import { DEFAULT_PROFILE } from '../src/lib/astro-engine/rules/profile.js';
import { getHouseGroups } from '../src/lib/astro-engine/calculations/vakri.js';

describe('SB5: the birth zone is read at the real moment, not at wall time read as UTC', () => {
  it('New York 2024-03-10 03:30 local is already summer time (-4), not winter time (-5)', () => {
    // 03:30 local that day is 07:30 UTC, after the 02:00 jump. Read as UTC it is 03:30Z = 22:30 the day before, still winter time.
    expect(tzOffsetHours('America/New_York', new Date(Date.UTC(2024, 2, 10, 3, 30)))).toBe(-4);
  });
  it('New York 2024-03-10 01:30 local is still winter time (-5)', () => {
    expect(tzOffsetHours('America/New_York', new Date(Date.UTC(2024, 2, 10, 1, 30)))).toBe(-5);
  });
  it('India in the 1942 war-time summer was +6:30 (the old read gave +5:30 near the edge)', () => {
    expect(tzOffsetHours('Asia/Kolkata', new Date(Date.UTC(1943, 5, 15, 12, 0)))).toBe(6.5);
  });
  it('autumn overlap: London 2024-10-27 00:30 local is still summer time (+1)', () => {
    expect(tzOffsetHours('Europe/London', new Date(Date.UTC(2024, 9, 27, 0, 30)))).toBe(1);
  });
  it('a zone name that does not exist is an error, never a silent +5:30', () => {
    expect(() => tzOffsetHours('Mars/Olympus_Mons', new Date(Date.UTC(2000, 0, 1, 12)))).toThrow();
  });
  it('numeric and signed offsets still work', () => {
    expect(tzOffsetHours('5.5', new Date())).toBe(5.5);
    expect(tzOffsetHours('-05:00', new Date())).toBe(-5);
    expect(tzOffsetHours('+0530', new Date())).toBe(5.5);
  });
});

describe('SB6: no profile field that nothing reads', () => {
  it('the profile has no dashaYearDays field (the dasha year is 365.25 days everywhere)', () => {
    expect('dashaYearDays' in DEFAULT_PROFILE).toBe(false);
  });
});

describe('SB7: house 7 is both a kendra and a maraka', () => {
  it('lists every group a house belongs to', () => {
    expect(getHouseGroups(7)).toEqual(expect.arrayContaining(['kendra', 'maraka']));
    expect(getHouseGroups(2)).toContain('maraka');
    expect(getHouseGroups(10)).toEqual(expect.arrayContaining(['kendra', 'upachaya']));
    expect(getHouseGroups(6)).toEqual(expect.arrayContaining(['dusthana', 'upachaya']));
    expect(getHouseGroups(9)).toEqual(['trikona']);
  });
});

describe('SB8: Decisions uses the same combustion rule as the chart', () => {
  const day = (venusLon: number, venusRetro: boolean): DaySky =>
    ({
      date: '2026-11-10',
      weekday: 1,
      tithi: 5,
      nakshatraIndex: 3,
      moonSignIndex: 2,
      eclipse: null,
      planets: [
        { planet: 'Sun', longitude: 200, signIndex: 6, sign: 'Libra', isRetrograde: false },
        {
          planet: 'Venus',
          longitude: venusLon,
          signIndex: 6,
          sign: 'Libra',
          isRetrograde: venusRetro,
        },
      ],
    }) as unknown as DaySky;
  const spec = { avoid: ['combust'] } as never;

  it('retrograde Venus 9 degrees from the Sun is NOT combust (orb 8, like planet-state)', () => {
    expect(isCombust('Venus', 209, 200, true)).toBe(false);
    expect(avoidFlags(day(209, true), spec)).not.toContain('combust');
  });
  it('direct Venus 9 degrees from the Sun is combust (orb 10)', () => {
    expect(avoidFlags(day(209, false), spec)).toContain('combust');
  });
  it('retrograde Venus 7 degrees from the Sun is combust', () => {
    expect(avoidFlags(day(207, true), spec)).toContain('combust');
  });
});

describe('SB11: the shadbala header does not say Yuddha Bala is missing', () => {
  it('no "NOT implemented ... Yuddha" line', () => {
    const src = readFileSync(
      new URL('../src/lib/astro-engine/calculations/shadbala.ts', import.meta.url),
      'utf8',
    );
    expect(src).not.toMatch(/NOT implemented[^]{0,80}Yuddha/);
  });
});
