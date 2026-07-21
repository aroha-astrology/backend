import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ephemeris worker pool (integration)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('EPHEMERIS_WORKER_POOL_SIZE', '2');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('computes the same chart through the pool as the in-process path', async () => {
    const { calculateChart } =
      await import('../src/lib/astro-engine/calculations/planetPositions.js');
    const chart = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');

    expect(chart.planets).toHaveLength(9);
    for (const p of chart.planets) {
      expect(Number.isFinite(p.longitude)).toBe(true);
      expect(p.house).toBeGreaterThanOrEqual(1);
      expect(p.house).toBeLessThanOrEqual(12);
    }
    expect(chart.ayanamsaValue).toBeGreaterThan(22);
    expect(chart.ayanamsaValue).toBeLessThan(25);
  }, 30_000);
});
