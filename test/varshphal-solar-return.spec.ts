import { describe, it, expect } from 'vitest';
import {
  findSolarReturnJd,
  computeSolarReturn,
} from '../src/lib/astro-engine/varshphal/solarReturn.js';
import {
  calculatePlanetPositions,
  dateToJulianDay,
} from '../src/lib/astro-engine/calculations/planetPositions.js';

const MUMBAI_LAT = 19.076;
const MUMBAI_LON = 72.8777;

describe('findSolarReturnJd (live ephemeris)', () => {
  it('finds an instant whose Sun longitude matches the natal Sun longitude to within a few arcseconds', async () => {
    const birthDate = new Date(Date.UTC(1985, 2, 11, 23, 2)); // 1985-03-12 04:32 IST -> UTC
    const birthJd = await dateToJulianDay(1985, 3, 12, 4, 32, 5.5);
    const natalPositions = await calculatePlanetPositions(birthJd);
    const natalSunLongitude = natalPositions.find((p) => p.planet === 'Sun')!.longitude;

    const returnJd = await findSolarReturnJd(natalSunLongitude, birthDate, 2026);
    const returnPositions = await calculatePlanetPositions(returnJd);
    const returnSunLongitude = returnPositions.find((p) => p.planet === 'Sun')!.longitude;

    const diffDeg = Math.abs(
      ((((returnSunLongitude - natalSunLongitude + 540) % 360) + 360) % 360) - 180,
    );
    const diffArcsec = diffDeg * 3600;
    expect(diffArcsec).toBeLessThan(5); // within a few arcseconds
  }, 30_000);

  it('finds a return instant close to the calendar anniversary, not some other year', async () => {
    const birthDate = new Date(Date.UTC(1990, 5, 15, 10, 0));
    const birthJd = await dateToJulianDay(1990, 6, 15, 10, 0, 0);
    const natalPositions = await calculatePlanetPositions(birthJd);
    const natalSunLongitude = natalPositions.find((p) => p.planet === 'Sun')!.longitude;

    const returnJd = await findSolarReturnJd(natalSunLongitude, birthDate, 2026);
    // JD for 2026-06-15 (approx anniversary) vs JD for the found return.
    const anniversaryJd = await dateToJulianDay(2026, 6, 15, 10, 0, 0);
    expect(Math.abs(returnJd - anniversaryJd)).toBeLessThan(2); // within 2 days
  }, 30_000);
});

describe('computeSolarReturn', () => {
  it('casts a full Varsha Kundali at the solar return instant, at the birth location', async () => {
    const birthDate = new Date(Date.UTC(1985, 2, 11, 23, 2));
    const birthJd = await dateToJulianDay(1985, 3, 12, 4, 32, 5.5);
    const natalPositions = await calculatePlanetPositions(birthJd);
    const natalSunLongitude = natalPositions.find((p) => p.planet === 'Sun')!.longitude;

    const result = await computeSolarReturn(
      natalSunLongitude,
      birthDate,
      2026,
      MUMBAI_LAT,
      MUMBAI_LON,
    );

    expect(result.chart.planets.length).toBeGreaterThan(0);
    expect(result.chart.ascendant).toBeDefined();
    expect(typeof result.isDayReturn).toBe('boolean');

    const chartSun = result.chart.planets.find((p) => p.planet === 'Sun')!;
    const diffDeg = Math.abs(
      ((((chartSun.longitude - natalSunLongitude + 540) % 360) + 360) % 360) - 180,
    );
    expect(diffDeg * 3600).toBeLessThan(5);
  }, 30_000);

  it('isDayReturn matches the Sun house placement (7-12 = day, 1-6 = night)', async () => {
    const birthDate = new Date(Date.UTC(1985, 2, 11, 23, 2));
    const birthJd = await dateToJulianDay(1985, 3, 12, 4, 32, 5.5);
    const natalPositions = await calculatePlanetPositions(birthJd);
    const natalSunLongitude = natalPositions.find((p) => p.planet === 'Sun')!.longitude;

    const result = await computeSolarReturn(
      natalSunLongitude,
      birthDate,
      2026,
      MUMBAI_LAT,
      MUMBAI_LON,
    );
    const sunHouse = result.chart.planets.find((p) => p.planet === 'Sun')!.house;
    expect(result.isDayReturn).toBe(sunHouse >= 7 && sunHouse <= 12);
  }, 30_000);
});
