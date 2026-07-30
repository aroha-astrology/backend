import { describe, it, expect } from 'vitest';
import {
  findDoubleTransitWindows,
  amplifyDoubleTransitWindows,
  type DoubleTransitWindow,
} from '../src/lib/astro-tools/double-transit.js';
import { detectDoubleTransit } from '../src/lib/astro-tools/transit.js';
import { calculatePlanetPositions } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { jdFromDate } from '../src/lib/astro-tools/transit-events.js';
import { DOMAIN_CONFIG } from '../src/lib/astro-engine/dasha-confidence.js';

describe('findDoubleTransitWindows (live ephemeris, self-verified against a brute-force day sweep)', () => {
  it('agrees with a brute-force day-by-day detectDoubleTransit() sweep over the same range', async () => {
    const from = new Date('2023-01-01T00:00:00Z');
    const to = new Date('2024-06-01T00:00:00Z'); // ~1.5 years, short enough for a fast brute-force sweep
    const natalMoonSignIdx = 3; // Cancer

    const windows = await findDoubleTransitWindows(from, to, natalMoonSignIdx);

    // Brute-force: sample every 15 days, ask "is house H active on this day
    // per the windows list" vs "is house H active per a fresh detectDoubleTransit call".
    const dayMs = 86_400_000;
    let checkedDays = 0;
    for (let t = from.getTime(); t < to.getTime(); t += 15 * dayMs) {
      const day = new Date(t);
      const positions = await calculatePlanetPositions(jdFromDate(day));
      const jupiterSign = positions.find((p) => p.planet === 'Jupiter')?.signIndex ?? 0;
      const saturnSign = positions.find((p) => p.planet === 'Saturn')?.signIndex ?? 0;
      const bruteForceActive = new Set(
        detectDoubleTransit(jupiterSign, saturnSign, natalMoonSignIdx).map((r) => r.house),
      );

      const windowActive = new Set(
        windows.filter((w) => day >= w.startDate && day < w.endDate).map((w) => w.house),
      );

      expect(Array.from(windowActive).sort()).toEqual(Array.from(bruteForceActive).sort());
      checkedDays++;
    }
    expect(checkedDays).toBeGreaterThan(20);
  }, 60_000);

  it('never returns overlapping windows for the SAME house', async () => {
    const from = new Date('2023-01-01T00:00:00Z');
    const to = new Date('2025-01-01T00:00:00Z');
    const windows = await findDoubleTransitWindows(from, to, 0);

    const byHouse = new Map<number, DoubleTransitWindow[]>();
    for (const w of windows) {
      if (!byHouse.has(w.house)) byHouse.set(w.house, []);
      byHouse.get(w.house)!.push(w);
    }
    for (const houseWindows of byHouse.values()) {
      const sorted = [...houseWindows].sort(
        (a, b) => a.startDate.getTime() - b.startDate.getTime(),
      );
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.startDate.getTime()).toBeGreaterThanOrEqual(
          sorted[i - 1]!.endDate.getTime(),
        );
      }
    }
  }, 30_000);

  it('every window has a start strictly before its end', async () => {
    const from = new Date('2023-01-01T00:00:00Z');
    const to = new Date('2024-01-01T00:00:00Z');
    const windows = await findDoubleTransitWindows(from, to, 6);
    for (const w of windows) {
      expect(w.startDate.getTime()).toBeLessThan(w.endDate.getTime());
    }
  }, 30_000);
});

describe('amplifyDoubleTransitWindows', () => {
  function win(signIndex: number): DoubleTransitWindow {
    return {
      house: 1,
      sign: 'Test',
      signIndex,
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-06-01'),
    };
  }

  it('flags domains whose triggerHouses (from Ascendant) match the window sign', () => {
    // career's triggerHouses = [10, 11] from Ascendant. Asc signIndex 0 (Aries):
    // house 10 from Asc = signIndex 9 (Capricorn).
    const result = amplifyDoubleTransitWindows([win(9)], 0, []);
    expect(result[0]!.houseFromAsc).toBe(10);
    expect(result[0]!.domains).toContain('career');
  });

  it('returns no domains when the house matches nothing in DOMAIN_CONFIG', () => {
    // House 1 from Ascendant (self) is not any domain's trigger/natal house by default.
    const result = amplifyDoubleTransitWindows([win(0)], 0, []);
    expect(result[0]!.houseFromAsc).toBe(1);
    // Sanity: confirm no domain actually claims house 1, so this assertion is meaningful.
    const anyDomainClaimsHouse1 = Object.values(DOMAIN_CONFIG).some(
      (c) => c.triggerHouses.includes(1) || c.natalHouses.includes(1),
    );
    expect(anyDomainClaimsHouse1).toBe(false);
    expect(result[0]!.domains).toHaveLength(0);
  });

  it('sets dashaAligned true only when an active Dasha lord is a static karaka of a matched domain', () => {
    // love's staticKarakas = ['Venus'], triggerHouses include 7 -> signIndex 6 from Asc 0.
    const withVenusDasha = amplifyDoubleTransitWindows([win(6)], 0, ['Venus']);
    expect(withVenusDasha[0]!.domains).toContain('love');
    expect(withVenusDasha[0]!.dashaAligned).toBe(true);

    // House 7 is ALSO claimed by 'legal' (natalHouses, karakas Saturn/Mars) and
    // 'business' (triggerHouses, karaka Mercury), so Rahu -- not a karaka of
    // any domain matching house 7 -- is the genuinely unrelated choice here.
    const withUnrelatedDasha = amplifyDoubleTransitWindows([win(6)], 0, ['Rahu']);
    expect(withUnrelatedDasha[0]!.dashaAligned).toBe(false);
  });

  it('preserves the original window fields alongside the new amplification fields', () => {
    const original = win(9);
    const result = amplifyDoubleTransitWindows([original], 0, []);
    expect(result[0]!.house).toBe(original.house);
    expect(result[0]!.sign).toBe(original.sign);
    expect(result[0]!.startDate).toEqual(original.startDate);
    expect(result[0]!.endDate).toEqual(original.endDate);
  });
});
