import { describe, it, expect } from 'vitest';
import {
  computeMuddaDasha,
  muddaAt,
  muddaStartIndex,
  MUDDA_ORDER,
  MUDDA_TOTAL_YEARS,
} from '../src/lib/astro-engine/varshphal/mudda-dasha.js';

const DAY = 86_400_000;
const LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];

describe('Mudda dasha: the order and the start lord', () => {
  it('shares one year among the nine Vimshottari lords in the ratio of their 120 years', () => {
    expect(MUDDA_ORDER.map((o) => o.planet)).toEqual(LORDS);
    expect(MUDDA_ORDER.reduce((sum, o) => sum + o.years, 0)).toBe(MUDDA_TOTAL_YEARS);
    expect(MUDDA_TOTAL_YEARS).toBe(120);
  });

  it('starts at (nakshatra number + completed years - 2) mod 9', () => {
    expect(muddaStartIndex(1, 1)).toBe(1); // Mehta: (1 - 2 + 1) = 0 means Venus
    expect(muddaStartIndex(1, 2)).toBe(2);
    expect(muddaStartIndex(1, 0)).toBe(0);
    expect(muddaStartIndex(27, 1)).toBe(0);
    expect(muddaStartIndex(14, 10)).toBe(5);
    expect(muddaStartIndex(3, 9)).toBe(2); // (3 + 9 - 1) = 11, mod 9
  });
});

describe('computeMuddaDasha', () => {
  const span360 = { solarReturnMs: 0, nextSolarReturnMs: 360 * DAY };

  it('on a 360-day year the periods are 21, 60, 18, 30, 21, 54, 48, 57, 51 days', () => {
    const periods = computeMuddaDasha({ nakshatraNumber: 9, completedYears: 1, ...span360 });
    expect(periods.map((p) => p.lord)).toEqual(LORDS);
    expect(periods.map((p) => (p.endMs - p.startMs) / DAY)).toEqual([21, 60, 18, 30, 21, 54, 48, 57, 51]);
  });

  it('rotates the start lord with the completed years', () => {
    const periods = computeMuddaDasha({ nakshatraNumber: 9, completedYears: 3, ...span360 });
    expect(periods[0]?.lord).toBe('Sun');
    expect(periods[8]?.lord).toBe('Venus');
  });

  it('on a real year length: contiguous, anchored at both solar returns, sub-periods too', () => {
    const start = 1_700_000_000_123;
    const end = start + 31_558_149_504; // 365.2563 days
    const periods = computeMuddaDasha({
      nakshatraNumber: 9,
      completedYears: 37,
      solarReturnMs: start,
      nextSolarReturnMs: end,
    });
    expect(periods[0]?.startMs).toBe(start);
    expect(periods[8]?.endMs).toBe(end);
    periods.forEach((p, i) => {
      if (i > 0) expect(p.startMs).toBe(periods[i - 1]?.endMs);
      expect(p.antardashas).toHaveLength(9);
      expect(p.antardashas[0]?.lord).toBe(p.lord);
      expect(p.antardashas[0]?.startMs).toBe(p.startMs);
      expect(p.antardashas[8]?.endMs).toBe(p.endMs);
      p.antardashas.forEach((a, k) => {
        if (k > 0) expect(a.startMs).toBe(p.antardashas[k - 1]?.endMs);
      });
    });
  });

  it('the seam: one year ends on the very number the next starts on', () => {
    const t0 = 1_000_000_000_000;
    const t1 = t0 + 31_557_600_000;
    const t2 = t1 + 31_558_800_000;
    const a = computeMuddaDasha({ nakshatraNumber: 5, completedYears: 40, solarReturnMs: t0, nextSolarReturnMs: t1 });
    const b = computeMuddaDasha({ nakshatraNumber: 5, completedYears: 41, solarReturnMs: t1, nextSolarReturnMs: t2 });
    expect(a[8]?.endMs).toBe(t1);
    expect(b[0]?.startMs).toBe(t1);
    expect(a[8]?.endMs).toBe(b[0]?.startMs);
  });

  it('sub-periods are proportional: in Ketu (21 days) Ketu gets 21*7/120 days, then Venus 21*20/120', () => {
    const [ketu] = computeMuddaDasha({ nakshatraNumber: 9, completedYears: 1, ...span360 });
    const [first, second] = ketu!.antardashas;
    expect(first?.lord).toBe('Ketu');
    expect(Math.abs((first!.endMs - first!.startMs) - (21 * 7 * DAY) / 120)).toBeLessThanOrEqual(1);
    expect(second?.lord).toBe('Venus');
    expect(Math.abs((second!.endMs - second!.startMs) - (21 * 20 * DAY) / 120)).toBeLessThanOrEqual(1);
  });

  it('refuses a year that does not run forward, and a nakshatra outside 1 to 27', () => {
    const ok = { completedYears: 1, solarReturnMs: 0, nextSolarReturnMs: 100 };
    expect(() => computeMuddaDasha({ nakshatraNumber: 9, completedYears: 1, solarReturnMs: 100, nextSolarReturnMs: 100 })).toThrow(/next solar return/);
    for (const bad of [0, 28, 1.5]) {
      expect(() => computeMuddaDasha({ nakshatraNumber: bad, ...ok })).toThrow(/nakshatraNumber/);
    }
  });
});

describe('muddaAt', () => {
  it('finds the running period and sub-period, start inclusive and end exclusive', () => {
    const periods = computeMuddaDasha({ nakshatraNumber: 9, completedYears: 1, solarReturnMs: 0, nextSolarReturnMs: 360 * DAY });

    const first = muddaAt(periods, 0);
    expect(first?.main.lord).toBe('Ketu');
    expect(first?.sub.lord).toBe('Ketu');

    const atVenus = muddaAt(periods, 21 * DAY);
    expect(atVenus?.main.lord).toBe('Venus');
    expect(atVenus?.sub.lord).toBe('Venus');

    // One ms before is the last sub-period of Ketu, the ninth lord from Ketu: Mercury.
    const before = muddaAt(periods, 21 * DAY - 1);
    expect(before?.main.lord).toBe('Ketu');
    expect(before?.sub.lord).toBe('Mercury');

    expect(muddaAt(periods, 360 * DAY)).toBeNull();
    expect(muddaAt(periods, -1)).toBeNull();
  });
});
