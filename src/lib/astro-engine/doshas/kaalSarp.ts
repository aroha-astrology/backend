// @ts-nocheck
import type { ChartData, KaalSarpDosha, Planet } from '@aroha-astrology/shared';
import { KAAL_SARP_TYPES } from '@aroha-astrology/shared';

/**
 * Kaal Sarp Dosha Detection
 *
 * All 7 planets (Sun through Saturn) must be hemmed between the
 * Rahu-Ketu axis. If exactly 1 planet falls outside, it is
 * classified as partial Kaal Sarp Dosha.
 *
 * 12 named types based on Rahu's and Ketu's house positions.
 */

const SEVEN_PLANETS: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

/**
 * Check if a house number is "between" Rahu and Ketu going forward
 * from Rahu to Ketu (exclusive of Rahu/Ketu houses themselves).
 *
 * "Between" means traversing houses from rahuHouse toward ketuHouse
 * in ascending (clockwise) order through the 12-house wheel.
 */
function isBetweenRahuKetu(house: number, rahuHouse: number, ketuHouse: number): boolean {
  if (house === rahuHouse || house === ketuHouse) return true; // on the axis itself counts as "in"

  // Traverse from Rahu toward Ketu in forward direction
  let current = rahuHouse;
  const visited: number[] = [];
  while (current !== ketuHouse) {
    current = (current % 12) + 1;
    if (current === ketuHouse) break;
    visited.push(current);
  }

  return visited.includes(house);
}

/**
 * Check if all planets are between Ketu and Rahu (the reverse half).
 * This is the "reverse" Kaal Sarp — planets hemmed on the other side.
 */
function isBetweenKetuRahu(house: number, rahuHouse: number, ketuHouse: number): boolean {
  if (house === rahuHouse || house === ketuHouse) return true;

  let current = ketuHouse;
  const visited: number[] = [];
  while (current !== rahuHouse) {
    current = (current % 12) + 1;
    if (current === rahuHouse) break;
    visited.push(current);
  }

  return visited.includes(house);
}

export function detectKaalSarpDosha(chartData: ChartData): KaalSarpDosha {
  const rahu = chartData.planets.find((p) => p.planet === 'Rahu');
  const ketu = chartData.planets.find((p) => p.planet === 'Ketu');

  if (!rahu || !ketu) {
    return {
      present: false,
      type: 'none',
      name: '',
      severity: 'none',
      rahuHouse: 0,
      ketuHouse: 0,
      isPartial: false,
    };
  }

  const rahuHouse = rahu.house;
  const ketuHouse = ketu.house;

  const planetHouses = SEVEN_PLANETS.map((planet) => {
    const pos = chartData.planets.find((p) => p.planet === planet);
    return { planet, house: pos ? pos.house : 0 };
  });

  // Check forward direction: all planets between Rahu -> Ketu
  let outsideForward = 0;
  for (const { house } of planetHouses) {
    if (!isBetweenRahuKetu(house, rahuHouse, ketuHouse)) {
      outsideForward++;
    }
  }

  // Check reverse direction: all planets between Ketu -> Rahu
  let outsideReverse = 0;
  for (const { house } of planetHouses) {
    if (!isBetweenKetuRahu(house, rahuHouse, ketuHouse)) {
      outsideReverse++;
    }
  }

  // Determine which direction yields Kaal Sarp (or partial)
  let isPresent = false;
  let isPartial = false;
  let outsideCount = 0;

  if (outsideForward === 0 || outsideReverse === 0) {
    isPresent = true;
    isPartial = false;
    outsideCount = 0;
  } else if (outsideForward === 1 || outsideReverse === 1) {
    isPresent = true;
    isPartial = true;
    outsideCount = Math.min(outsideForward, outsideReverse);
  }

  if (!isPresent) {
    return {
      present: false,
      type: 'none',
      name: '',
      severity: 'none',
      rahuHouse,
      ketuHouse,
      isPartial: false,
    };
  }

  // Determine the named type from KAAL_SARP_TYPES
  const typeKey = `${rahuHouse}-${ketuHouse}`;
  const name = KAAL_SARP_TYPES[typeKey] || 'Unknown';

  // Severity: full is more severe than partial
  let severity: KaalSarpDosha['severity'];
  if (isPartial) {
    severity = 'mild';
  } else {
    severity = 'severe';
  }

  return {
    present: true,
    type: typeKey,
    name,
    severity,
    rahuHouse,
    ketuHouse,
    isPartial,
  };
}

