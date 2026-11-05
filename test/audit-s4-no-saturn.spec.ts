import { describe, it, expect, vi } from 'vitest';
import type * as PlanetPositions from '../src/lib/astro-engine/calculations/planetPositions';

// Audit L4: an ephemeris answer with no Saturn used to make Saturn 0 degrees (Aries), so Sade Sati
// and Dhaiya were worked out for a Saturn that was never there. It must raise an error instead.
// The real ephemeris always has Saturn, so this one test removes it from a real answer.
vi.mock('../src/lib/astro-engine/calculations/planetPositions', async (importOriginal) => {
  const real = await importOriginal<typeof PlanetPositions>();
  return {
    ...real,
    calculatePlanetPositions: async (jd: number) =>
      (await real.calculatePlanetPositions(jd)).filter((p) => p.planet !== 'Saturn'),
  };
});

describe('no silent default for a missing Saturn (L4)', () => {
  it('getCurrentSaturnLongitude throws instead of returning 0', async () => {
    const { getCurrentSaturnLongitude } =
      await import('../src/lib/astro-engine/doshas/sadeSati.js');
    await expect(getCurrentSaturnLongitude(new Date('2026-11-04T06:00:00Z'))).rejects.toThrow(
      /Saturn/,
    );
  });
});
