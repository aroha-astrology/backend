import { describe, it, expect } from 'vitest';
import { calculatePlanetPositions } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { jdFromDate } from '../src/lib/astro-tools/transit-events.js';
import { ASTA_PERIODS, ASTA_YEARS, fallbackAsta, firstFallbackFor } from '../src/config/asta-dates.js';

// =============================================================================
// The fallback orb never opens a day drikpanchang blocks (owner, 2026-11-09)
// =============================================================================
// For a year the drikpanchang table does not cover, Decide falls back to an orb. Its Asta window must CONTAIN
// drikpanchang's published window, for both planets, in every year the table does cover (2026 and 2027): then a
// fallback year can only close more days than drikpanchang would, never fewer.
// =============================================================================

const HOUR = 3_600_000;

async function fallbackWindow(planet: 'Venus' | 'Jupiter', fromMs: number, toMs: number): Promise<[number, number] | null> {
  let first: number | null = null;
  let last: number | null = null;
  for (let t = fromMs; t <= toMs; t += HOUR) {
    const pos = await calculatePlanetPositions(jdFromDate(new Date(t)), 'lahiri');
    const sun = pos.find((p) => p.planet === 'Sun')!;
    const pl = pos.find((p) => p.planet === planet)!;
    if (fallbackAsta(planet, pl.longitude, sun.longitude, pl.isRetrograde)) {
      first ??= t;
      last = t;
    } else if (first !== null && t > toMs - 30 * 24 * HOUR) {
      break;
    }
  }
  return first === null ? null : [first, last!];
}

describe('fallback Asta window contains drikpanchang\'s window', () => {
  expect(ASTA_YEARS).toEqual([2026, 2027]);

  for (const p of ASTA_PERIODS) {
    it(`${p.planet} ${p.startsAt.slice(0, 10)} to ${p.endsAt.slice(0, 10)}`, async () => {
      const a = Date.parse(p.startsAt);
      const b = Date.parse(p.endsAt);
      const w = await fallbackWindow(p.planet, a - 45 * 24 * HOUR, b + 45 * 24 * HOUR);
      expect(w, 'the fallback finds an Asta window around this period').not.toBeNull();
      const [from, to] = w!;
      expect(from, `fallback starts ${new Date(from).toISOString()}, drik ${p.startsAt}`).toBeLessThanOrEqual(a);
      expect(to, `fallback ends ${new Date(to).toISOString()}, drik ${p.endsAt}`).toBeGreaterThanOrEqual(b);
    }, 300_000);
  }
});

describe('fallback logging', () => {
  it('reports a year only the first time', () => {
    expect(firstFallbackFor(2031)).toBe(true);
    expect(firstFallbackFor(2031)).toBe(false);
    expect(firstFallbackFor(2032)).toBe(true);
  });
});
