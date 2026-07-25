import { describe, it, expect } from 'vitest';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { calculateAshtakavarga } from '../src/lib/astro-engine/calculations/ashtakavarga.js';

// Guards the critical fix (the swisseph-wasm dependency must resolve and
// compute — not MODULE_NOT_FOUND) and the house-assignment fix (#18): every
// planet must land in a real house 1–12, never the old "house 0" sentinel.
describe('astro-engine: calculateChart', () => {
  it('computes a sidereal chart with planets assigned to houses 1-12', async () => {
    // 1990-05-20 06:30 IST (tz +5.5), Mumbai.
    const chart = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');

    expect(chart.planets).toHaveLength(9); // Sun..Saturn + Rahu + Ketu
    for (const p of chart.planets) {
      expect(Number.isFinite(p.longitude)).toBe(true);
      expect(p.longitude).toBeGreaterThanOrEqual(0);
      expect(p.longitude).toBeLessThan(360);
      expect(p.house).toBeGreaterThanOrEqual(1);
      expect(p.house).toBeLessThanOrEqual(12);
      expect(p.sign).toBeTruthy();
    }

    expect(chart.houses).toHaveLength(12);
    expect(chart.ascendant.sign).toBeTruthy();
    expect(Number.isFinite(chart.ayanamsaValue)).toBe(true);
    // Lahiri ayanamsa near 1990 is ~23–24°.
    expect(chart.ayanamsaValue).toBeGreaterThan(22);
    expect(chart.ayanamsaValue).toBeLessThan(25);
  }, 20_000);

  // The house-0 bug (#18) specifically bit QUADRANT systems (intercepted
  // signs), not whole-sign. Exercise Placidus to guard exactly that case.
  it('assigns every planet to a real house under Placidus (quadrant) houses', async () => {
    const chart = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'P');
    for (const p of chart.planets) {
      expect(p.house).toBeGreaterThanOrEqual(1);
      expect(p.house).toBeLessThanOrEqual(12);
    }
  }, 20_000);
});

// The classical BPHS Bhinnashtakavarga benefic-point rules yield a fixed
// bindu total per planet — Sun=48, Moon=49, Mars=39, Mercury=54, Jupiter=56,
// Venus=52, Saturn=39 (grand total 337) — for ANY birth chart, since every
// contributor rule always lands on exactly one of the 12 signs. A wrong
// house number in the BENEFIC_POINTS table (e.g. a stray extra entry)
// throws a planet's total off regardless of which chart is fed in, which is
// what caught a spurious "9" in Saturn's Sun-row (was 40, should be 39).
describe('astro-engine: calculateAshtakavarga', () => {
  it('produces the chart-invariant classical bindu totals per planet (sum 337)', async () => {
    const chart = await calculateChart(1993, 4, 17, 20, 26, 5.5, 26.18, 91.75, 'lahiri', 'W');
    const { bhinna, sarva } = calculateAshtakavarga(chart);

    const expectedTotals: Record<string, number> = {
      Sun: 48,
      Moon: 49,
      Mars: 39,
      Mercury: 54,
      Jupiter: 56,
      Venus: 52,
      Saturn: 39,
    };
    for (const b of bhinna) {
      expect(b.total).toBe(expectedTotals[b.planet]);
    }
    expect(sarva.total).toBe(337);
  }, 20_000);
});

// Guards a subtle correctness hazard introduced by caching: calculateChart's
// final swe.get_ayanamsa(jd) call reads GLOBAL mutable sid_mode state on the
// shared swisseph instance. If planetPositions/houses/ascendant are served
// from cache (skipping the swe.set_sid_mode() call each core function does
// internally), a stale sid_mode from a PRIOR call with a different ayanamsa
// must not leak into this chart's ayanamsaValue.
describe('astro-engine: calculateChart ayanamsa cache correctness', () => {
  it('returns the correct ayanamsaValue per-ayanamsa even when planet/house data is cache-warm', async () => {
    // Warm the cache with 'lahiri' first.
    await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');
    // Same date/time/location, different ayanamsa — must not reuse lahiri's sid_mode.
    const raman = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'raman', 'W');
    // B.V. Raman ayanamsa near 1990 is ~21-22°, distinct from Lahiri's ~23-24°.
    expect(raman.ayanamsaValue).toBeGreaterThan(20);
    expect(raman.ayanamsaValue).toBeLessThan(23);
  }, 20_000);
});
