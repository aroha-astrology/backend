import { describe, it, expect } from 'vitest';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';

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
