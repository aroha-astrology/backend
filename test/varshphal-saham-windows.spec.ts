import { describe, it, expect } from 'vitest';
import {
  proximityWindows,
  buildTriggers,
  computeSahamWindows,
} from '../src/lib/astro-engine/varshphal/saham-windows.js';
import { jdFromDate } from '../src/lib/astro-tools/transit-events.js';

const DAY = 86_400_000;
const days = (n: number) => Array.from({ length: n + 1 }, (_, i) => i * DAY);

describe('proximityWindows', () => {
  it('a planet crossing the point at 1 degree a day: window, exact pass and area', () => {
    const t = days(10);
    const w = proximityWindows(t, t.map((_, i) => -5 + i), 3);
    expect(w).toHaveLength(1);
    expect(w[0]!.startMs).toBeCloseTo(2 * DAY, 3);
    expect(w[0]!.endMs).toBeCloseTo(8 * DAY, 3);
    expect(w[0]!.exactMs).toEqual([5 * DAY]);
    expect(w[0]!.integralDays).toBeCloseTo(3, 9);
  });

  it('a crossing between two samples is placed by interpolation', () => {
    const t = days(10);
    const w = proximityWindows(t, t.map((_, i) => -5.5 + i), 3);
    expect(w).toHaveLength(1);
    expect(w[0]!.startMs).toBeCloseTo(2.5 * DAY, 3);
    expect(w[0]!.endMs).toBeCloseTo(8.5 * DAY, 3);
    expect(w[0]!.exactMs[0]).toBeCloseTo(5.5 * DAY, 3);
    expect(w[0]!.integralDays).toBeCloseTo(3, 9);
  });

  it('a slower planet scores more, because it stays longer (no division by speed)', () => {
    const t = days(10);
    const w = proximityWindows(t, t.map((_, i) => -2.5 + 0.5 * i), 3);
    expect(w).toHaveLength(1);
    expect(w[0]!.startMs).toBe(0);
    expect(w[0]!.endMs).toBe(10 * DAY);
    expect(w[0]!.integralDays).toBeCloseTo(35 / 6, 9);
    expect(w[0]!.integralDays).toBeGreaterThan(3);
    expect(w[0]!.exactMs).toEqual([5 * DAY]);
  });

  it('nothing when never in the orb, and no false crossing across the far side of the zodiac', () => {
    const t = days(10);
    expect(proximityWindows(t, t.map(() => 10), 3)).toEqual([]);
    expect(proximityWindows([0, DAY], [170, -170], 3)).toEqual([]);
  });

  it('a planet that leaves the orb and comes back gives two windows', () => {
    const w = proximityWindows(days(8), [-4, -2, 0, 2, 4, 2, 0, -2, -4], 3);
    expect(w).toHaveLength(2);
    expect(w[0]!.exactMs).toContain(2 * DAY);
    expect(w[1]!.exactMs).toContain(6 * DAY);
  });
});

describe('buildTriggers', () => {
  it('adds the Year Lord and the Muntha lord to Sun, Mars, Mercury and Venus', () => {
    const t = buildTriggers('Jupiter', 'Saturn');
    expect(t.map((x) => x.planet)).toEqual(['Sun', 'Mars', 'Mercury', 'Venus', 'Jupiter', 'Saturn']);
    expect(t[4]!.roles).toEqual(['Year Lord']);
    expect(t[5]!.roles).toEqual(['Muntha lord']);
  });

  it('merges roles when the same planet holds more than one', () => {
    const same = buildTriggers('Sun', 'Sun');
    expect(same).toHaveLength(4);
    expect(same[0]!.roles).toEqual(['Sun', 'Year Lord', 'Muntha lord']);
    const mars = buildTriggers('Mars', 'Jupiter');
    expect(mars).toHaveLength(5);
    expect(mars.find((x) => x.planet === 'Mars')!.roles).toEqual(['Mars', 'Year Lord']);
  });
});

describe('computeSahamWindows', () => {
  const fromMs = Date.UTC(2027, 0, 1);
  const jd0 = jdFromDate(new Date(fromMs));
  const saham = {
    name: 'Test',
    longitude: 15,
    lord: 'Mars',
    signIndex: 0,
    sign: 'Aries',
    houseFromVarshaAsc: 1,
    beneficSupported: false,
  };
  // The Sun walks 10 -> 40 degrees at 1 a day; Mars sits 1 degree from the point; the rest are far away.
  const positionsAt = (jd: number) => Promise.resolve({
    Sun: 10 + (jd - jd0),
    Mars: 16,
    Mercury: 200,
    Venus: 200,
    Jupiter: 300,
    Saturn: 300,
  });
  const base = {
    sahams: [saham],
    yearLord: 'Jupiter',
    munthaLord: 'Saturn',
    fromMs,
    toMs: fromMs + 30 * DAY,
    stepDays: 1,
    positionsAt,
  };

  it('finds the Sun passing the point and Mars (the Saham lord) staying on it, with the lord bonus', async () => {
    const w = await computeSahamWindows(base);
    expect(w).toHaveLength(2);

    const [mars, sun] = w as [(typeof w)[number], (typeof w)[number]];
    expect(mars.planet).toBe('Mars');
    expect(mars.lordBonusApplied).toBe(true);
    expect(mars.startMs).toBe(fromMs);
    expect(mars.endMs).toBe(fromMs + 30 * DAY);
    expect(mars.integralDays).toBeCloseTo(20, 6);
    expect(mars.strength).toBeCloseTo(20 * 1.35, 6);

    expect(sun.planet).toBe('Sun');
    expect(sun.lordBonusApplied).toBe(false);
    expect(Math.abs(sun.startMs - (fromMs + 2 * DAY))).toBeLessThan(1000);
    expect(Math.abs(sun.endMs - (fromMs + 8 * DAY))).toBeLessThan(1000);
    expect(sun.integralDays).toBeCloseTo(3, 4);
    expect(sun.strength).toBe(sun.integralDays);
    expect(sun.exactMs).toHaveLength(1);
    expect(Math.abs(sun.exactMs[0]! - (fromMs + 5 * DAY))).toBeLessThan(1000);
  });

  it('the lord bonus is configurable and touches only the Saham lord', async () => {
    const w = await computeSahamWindows({ ...base, lordBonus: 2 });
    const mars = w.find((x) => x.planet === 'Mars')!;
    const sun = w.find((x) => x.planet === 'Sun')!;
    expect(mars.strength).toBeCloseTo(40, 6);
    expect(sun.strength).toBe(sun.integralDays);
  });
});
