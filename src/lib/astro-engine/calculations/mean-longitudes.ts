// =============================================================================
// Mean longitudes of the planets, for Cheshta Bala
// =============================================================================
// Parāśara's motional strength (BPHS 27.24, register BPHS-27.24) measures a
// planet's "ceṣṭā kendra": its own śīghrocca (the point its apparent loop is
// centred on) minus the average of its MEAN and its TRUE longitude. The
// ephemeris gives true longitudes only, so the mean ones come from the mean
// longitude of each planet.
//
// In the Sūrya-Siddhānta scheme the śīghrocca of Mars, Jupiter and Saturn is
// the Sun's mean longitude, and their mean position is their own mean
// heliocentric longitude; for Mercury and Venus it is the other way round.
//
// Constants: mean longitude at J2000.0 and its rate per Julian century, from
// the JPL "Keplerian elements for approximate positions of the major planets"
// (valid 1800-2050, equinox of J2000). They are astronomy constants, not
// jyotish rules, so no old text is involved; test/audit/shadbala.audit.spec.ts
// keeps each mean longitude within the planet's equation of centre of the
// ephemeris's true heliocentric longitude, which would catch a wrong constant.
// =============================================================================

export type MeanLongitudeBody = 'Mercury' | 'Venus' | 'Earth' | 'Mars' | 'Jupiter' | 'Saturn';

const ELEMENTS: Record<MeanLongitudeBody, { l0: number; rate: number }> = {
  Mercury: { l0: 252.2503235, rate: 149472.67411175 },
  Venus: { l0: 181.9790995, rate: 58517.81538729 },
  Earth: { l0: 100.46457166, rate: 35999.37306329 },
  Mars: { l0: -4.55343205, rate: 19140.30268499 },
  Jupiter: { l0: 34.39644051, rate: 3034.74612775 },
  Saturn: { l0: 49.95424423, rate: 1222.49362201 },
};

/** General precession in longitude, degrees per Julian century (J2000 frame to the equinox of date). */
const PRECESSION_PER_CENTURY = 1.396971;

function normalize(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Mean heliocentric longitude of a planet, in the J2000 frame (not sidereal).
 * `jd` is a Julian Day; UT is used for TT, which is 70 seconds out in 2026 and
 * invisible at mean-longitude precision.
 */
export function meanHeliocentricLongitudeJ2000(body: MeanLongitudeBody, jd: number): number {
  const t = (jd - 2451545.0) / 36525;
  const { l0, rate } = ELEMENTS[body];
  return normalize(l0 + rate * t);
}

/** Sidereal mean heliocentric longitude, using the chart's own ayanamsa value. */
export function meanSiderealLongitude(
  body: MeanLongitudeBody,
  jd: number,
  ayanamsaValue: number,
): number {
  const t = (jd - 2451545.0) / 36525;
  return normalize(
    meanHeliocentricLongitudeJ2000(body, jd) + PRECESSION_PER_CENTURY * t - ayanamsaValue,
  );
}

/** Sidereal mean longitude of the Sun as seen from the Earth (the Earth's, turned half a circle). */
export function meanSunSiderealLongitude(jd: number, ayanamsaValue: number): number {
  return normalize(meanSiderealLongitude('Earth', jd, ayanamsaValue) + 180);
}
