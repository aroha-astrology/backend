import { describe, it, expect } from 'vitest';
import { computeVarshphal } from '../src/lib/astro-engine/varshphal/index.js';
import {
  calculatePlanetPositions,
  dateToJulianDay,
} from '../src/lib/astro-engine/calculations/planetPositions.js';

describe('computeVarshphal (end-to-end)', () => {
  it('assembles solar return + Muntha + Varsheshwara + Sahams into one coherent yearly result', async () => {
    const birthDate = new Date(Date.UTC(1985, 2, 11, 23, 2)); // 1985-03-12 04:32 IST
    const birthJd = await dateToJulianDay(1985, 3, 12, 4, 32, 5.5);
    const natalPositions = await calculatePlanetPositions(birthJd);
    const natalSunLongitude = natalPositions.find((p) => p.planet === 'Sun')!.longitude;

    const result = await computeVarshphal({
      natalSunLongitude,
      natalAscSignIndex: 4, // arbitrary fixed natal Ascendant for this test
      birthDate,
      targetYear: 2026,
      latitude: 19.076,
      longitude: 72.8777,
    });

    expect(result.targetYear).toBe(2026);
    expect(result.completedYearsOfAge).toBe(41); // 2026 - 1985
    expect(result.solarReturn.chart.planets.length).toBeGreaterThan(0);
    expect(result.muntha.signIndex).toBeGreaterThanOrEqual(0);
    expect(result.muntha.signIndex).toBeLessThanOrEqual(11);
    expect(result.varsheshwara.candidates).toHaveLength(5);
    expect(result.sahams).toHaveLength(5);

    // Muntha must be exactly (age + natal Asc) mod 12.
    expect(result.muntha.signIndex).toBe((41 + 4) % 12);
  }, 30_000);

  it('a different target year produces a different Muntha sign and a different solar-return chart', async () => {
    const birthDate = new Date(Date.UTC(1985, 2, 11, 23, 2));
    const birthJd = await dateToJulianDay(1985, 3, 12, 4, 32, 5.5);
    const natalPositions = await calculatePlanetPositions(birthJd);
    const natalSunLongitude = natalPositions.find((p) => p.planet === 'Sun')!.longitude;

    const year1 = await computeVarshphal({
      natalSunLongitude,
      natalAscSignIndex: 4,
      birthDate,
      targetYear: 2026,
      latitude: 19.076,
      longitude: 72.8777,
    });
    const year2 = await computeVarshphal({
      natalSunLongitude,
      natalAscSignIndex: 4,
      birthDate,
      targetYear: 2027,
      latitude: 19.076,
      longitude: 72.8777,
    });

    expect(year1.muntha.signIndex).not.toBe(year2.muntha.signIndex);
    expect(year1.solarReturn.exactAt.getTime()).not.toBe(year2.solarReturn.exactAt.getTime());
  }, 30_000);
});
