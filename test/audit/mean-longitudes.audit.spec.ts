import { describe, it, expect } from 'vitest';
import { getSwe } from '../../src/lib/astro-engine/calculations/planetPositions.core.js';
import {
  meanHeliocentricLongitudeJ2000,
  meanSunSiderealLongitude,
  type MeanLongitudeBody,
} from '../../src/lib/astro-engine/calculations/mean-longitudes.js';

// =============================================================================
// Mean longitudes used by Cheshta Bala (BPHS 27.24). Astronomy, not jyotish:
// the check is that each mean longitude stays within twice the planet's orbital
// eccentricity (the largest gap between mean and true position, the equation of
// centre) of the Swiss Ephemeris true HELIOCENTRIC longitude, over a century.
// A wrong zero point or rate drifts out of that band.
// =============================================================================

const SEFLG_SWIEPH = 2;
const SEFLG_HELCTR = 8;
const SEFLG_J2000 = 32;

const BODIES: Array<{ body: MeanLongitudeBody; seId: number; eccentricity: number }> = [
  { body: 'Mercury', seId: 2, eccentricity: 0.2056 },
  { body: 'Venus', seId: 3, eccentricity: 0.0068 },
  { body: 'Mars', seId: 4, eccentricity: 0.0934 },
  { body: 'Jupiter', seId: 5, eccentricity: 0.0484 },
  { body: 'Saturn', seId: 6, eccentricity: 0.0539 },
];

/** Largest gap between mean and true longitude: a little over 2e radians (2e + 1.25e^2 ... ), in degrees. */
const maxEquationOfCentre = (e: number) => (2 * e + 1.25 * e * e) * (180 / Math.PI);

const gap = (a: number, b: number) => Math.abs(((((a - b + 540) % 360) + 360) % 360) - 180);

describe('mean longitudes stay within the equation of centre of the true heliocentric longitude', () => {
  // One date every 7 years and 83 days from 1900 to 2040 (about 20 dates), so
  // every planet is seen at many points of its orbit.
  const jds: number[] = [];
  for (let i = 0; i < 20; i++) jds.push(2415020.5 + i * 2638.3);

  it.each(BODIES)(
    '$body',
    async ({ body, seId, eccentricity }) => {
      const swe = await getSwe();
      const limit = maxEquationOfCentre(eccentricity) + 1.0;
      for (const jd of jds) {
        const truth = Number(
          swe.calc(jd, seId, SEFLG_SWIEPH | SEFLG_HELCTR | SEFLG_J2000).longitude,
        );
        const mean = meanHeliocentricLongitudeJ2000(body, jd);
        expect(gap(mean, truth), `${body} at JD ${jd}`).toBeLessThan(limit);
      }
    },
    60_000,
  );

  it('the Sun’s mean longitude is half a turn from the Earth’s', () => {
    // At J2000.0 the Sun’s mean longitude is 280.46 degrees (the Earth's 100.46 plus 180).
    // Sidereal conversion removes the ayanamsa; with 0 it is the J2000 value plus nothing.
    expect(meanSunSiderealLongitude(2451545.0, 0)).toBeCloseTo(280.46457, 3);
  });
});
