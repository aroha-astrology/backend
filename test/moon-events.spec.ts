import { describe, expect, it } from 'vitest';
import { findMoonChanges } from '../src/lib/astro-tools/moon-events.js';
import { calculatePlanetPositions } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { jdFromDate } from '../src/lib/astro-tools/transit-events.js';

/** Real ephemeris over a real window — slow by unit-test standards, see transit-events.spec.ts. */
const SLOW = 240_000;

async function moonAt(date: Date) {
  const positions = await calculatePlanetPositions(jdFromDate(date));
  return positions.find((p) => p.planet === 'Moon')!;
}

describe('findMoonChanges', () => {
  it(
    'finds one sidereal month of sign and nakshatra changes, each pinned to the minute',
    async () => {
      const from = new Date('2026-09-01T00:00:00Z');
      const to = new Date('2026-09-28T08:00:00Z'); // ~27.3 days, one sidereal month
      const events = await findMoonChanges(from, to);

      const signs = events.filter((e) => e.kind === 'sign');
      const naks = events.filter((e) => e.kind === 'nakshatra');
      // The Moon crosses all 12 signs and all 27 nakshatras once per sidereal month.
      expect(signs.length).toBeGreaterThanOrEqual(11);
      expect(signs.length).toBeLessThanOrEqual(13);
      expect(naks.length).toBeGreaterThanOrEqual(26);
      expect(naks.length).toBeLessThanOrEqual(28);

      // Chronological, and consecutive sign changes chain (one's `to` is the next's `from`).
      for (let i = 1; i < events.length; i++) {
        expect(events[i]!.exactAt.getTime()).toBeGreaterThanOrEqual(
          events[i - 1]!.exactAt.getTime(),
        );
      }
      for (let i = 1; i < signs.length; i++) {
        expect(signs[i]!.from).toBe(signs[i - 1]!.to);
      }

      // Spot-check precision on a few: two minutes either side of `exactAt`
      // the Moon is in `from`, then in `to`.
      for (const e of [signs[0]!, signs[5]!, naks[0]!, naks[13]!]) {
        const before = await moonAt(new Date(e.exactAt.getTime() - 2 * 60_000));
        const after = await moonAt(new Date(e.exactAt.getTime() + 2 * 60_000));
        if (e.kind === 'sign') {
          expect(before.sign).toBe(e.from);
          expect(after.sign).toBe(e.to);
          expect(after.signIndex).toBe(e.toIndex);
        } else {
          expect(before.nakshatra).toBe(e.from);
          expect(after.nakshatra).toBe(e.to);
          expect(after.nakshatraIndex).toBe(e.toIndex);
        }
      }
    },
    SLOW,
  );

  it(
    'returns only the requested kind',
    async () => {
      const from = new Date('2026-09-01T00:00:00Z');
      const to = new Date('2026-09-06T00:00:00Z');
      const events = await findMoonChanges(from, to, ['sign']);
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.kind === 'sign')).toBe(true);
    },
    SLOW,
  );
});
