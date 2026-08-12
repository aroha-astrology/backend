// =============================================================================
// Lal Kitab Varshphal — the deterministic annual house rotation
// =============================================================================
// Lal Kitab's year chart is NOT the Tajika solar return in
// astro-engine/varshphal/ (which resolves the exact instant the Sun returns to
// its natal longitude, and needs real ephemeris work). It is a pure
// arithmetic rotation: on each birthday every planet advances one house, so
// the whole year chart is a function of natal house + age alone.
//
// The practical consequence, and the reason Lal Kitab is usually taught this
// way, is that the result is completely immune to birth-time error — an hour
// or two of uncertainty in the recorded time cannot change the rotation. That
// is a genuinely different guarantee from the Tajika module, so the two
// coexist rather than one replacing the other.
//
// Because a planet's dignity changes every year under this rotation, Lal
// Kitab holds that remedies must be refreshed annually: the remedy for a
// planet in the 3rd house is not the remedy for that planet once it has
// rotated into the 8th.
//
// Pure and synchronous — no LLM, no DB, no cache. Caching it would only
// create a birthday-invalidation problem for no gain.
// =============================================================================

import { LALKITAB_PAKKA_GHAR } from '@aroha-astrology/shared';
import { getLalKitabRemedies } from './remedies.js';
import type { Planet } from '@aroha-astrology/shared';

/** Houses Lal Kitab treats as supportive. Matches AUSPICIOUS_HOUSES in
 * varshphal/muntha.ts — the same classical list, kept in agreement. */
const AUSPICIOUS_HOUSES = new Set([1, 2, 3, 5, 9, 10, 11]);
/** The classical dusthanas — houses of loss, obstruction and hidden strain. */
const DUSTHANA_HOUSES = new Set([6, 8, 12]);

export interface AnnualPlanet {
  planet: Planet;
  natalHouse: number;
  /** Where the planet sits for this year of life. */
  annualHouse: number;
  /** Dignity gained (+) or lost (-) by the rotation. Drives Kismat/Dhokhe below. */
  dignityDelta: number;
  /** This year's remedies — the natal database re-read at the rotated house. */
  remedies: string[];
  totke: string[];
}

export interface AnnualRotation {
  /** Completed years of age the rotation was computed for. */
  age: number;
  /** Muntha: the year's point of focus, by the age+1 rule counted from the
   * natal Ascendant (which is house 1 by definition in the natal frame). */
  muntha: number;
  planets: AnnualPlanet[];
  /** Kismat Ka Grah — the year's benefactor, the planet gaining most dignity.
   * Null when no planet gains any. */
  kismatKaGrah: Planet | null;
  /** Dhokhe Ka Grah — where the year's turbulence comes from, the planet
   * losing most dignity. Its remedy is the one to prioritise. Null when no
   * planet loses any. */
  dhokheKaGrah: Planet | null;
}

/**
 * Advance a natal house by `age` years. At any multiple of 12 this is the
 * identity — the full rotation completes and every planet returns to its
 * natal house, which is the cycle Lal Kitab builds the year chart on.
 */
export function rotateHouse(natalHouse: number, age: number): number {
  return ((((natalHouse - 1 + age) % 12) + 12) % 12) + 1;
}

/**
 * Muntha for a given age, by the "age + 1" rule: count age+1 houses from the
 * natal Ascendant, counting the Ascendant itself as the first.
 */
export function computeLalKitabMuntha(age: number): number {
  return (((age % 12) + 12) % 12) + 1;
}

/**
 * A planet's standing in a house, as a small integer. Deliberately coarse —
 * Pakka Ghar occupancy plus the classical auspicious/dusthana split — because
 * only the CHANGE between natal and annual position is used, and a coarse
 * score keeps that comparison legible. Shadbala is not pulled in for this.
 */
function dignity(planet: Planet, house: number): number {
  let score = 0;
  if (LALKITAB_PAKKA_GHAR[planet] === house) score += 2;
  if (DUSTHANA_HOUSES.has(house)) score -= 2;
  else if (AUSPICIOUS_HOUSES.has(house)) score += 1;
  return score;
}

/** Completed years of age on `asOf`, from an ISO `YYYY-MM-DD` date of birth. */
export function completedYearsOfAge(dateOfBirth: string, asOf: Date): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  if (!y || !m || !d) return 0;
  let age = asOf.getFullYear() - y;
  // Not yet had this year's birthday.
  const month = asOf.getMonth() + 1;
  if (month < m || (month === m && asOf.getDate() < d)) age -= 1;
  return age < 0 ? 0 : age;
}

/**
 * Rotate every planet in `natalHouses` forward by `age` years and read this
 * year's remedies at the rotated positions.
 *
 * Planet order in the output follows the input map's insertion order, so
 * ties on dignityDelta resolve deterministically to the first planet listed
 * rather than depending on object-key iteration.
 */
export function computeAnnualRotation(
  natalHouses: ReadonlyMap<Planet, number>,
  age: number,
): AnnualRotation {
  const planets: AnnualPlanet[] = [];

  for (const [planet, natalHouse] of natalHouses) {
    if (!Number.isInteger(natalHouse) || natalHouse < 1 || natalHouse > 12) continue;
    const annualHouse = rotateHouse(natalHouse, age);
    const { remedies, totke } = getLalKitabRemedies(planet, annualHouse);
    planets.push({
      planet,
      natalHouse,
      annualHouse,
      dignityDelta: dignity(planet, annualHouse) - dignity(planet, natalHouse),
      remedies,
      totke,
    });
  }

  let kismat: AnnualPlanet | null = null;
  let dhokhe: AnnualPlanet | null = null;
  for (const p of planets) {
    if (p.dignityDelta > 0 && (!kismat || p.dignityDelta > kismat.dignityDelta)) kismat = p;
    if (p.dignityDelta < 0 && (!dhokhe || p.dignityDelta < dhokhe.dignityDelta)) dhokhe = p;
  }

  return {
    age,
    muntha: computeLalKitabMuntha(age),
    planets,
    kismatKaGrah: kismat?.planet ?? null,
    dhokheKaGrah: dhokhe?.planet ?? null,
  };
}
