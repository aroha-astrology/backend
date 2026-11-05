// @ts-nocheck
import type { ChartData, KaalSarpDosha, Planet } from '@aroha-astrology/shared';
import { KAAL_SARP_TYPES } from '@aroha-astrology/shared';

/**
 * Kaal Sarp Dosha Detection (audit Sprint 9, G3 + SB4)
 *
 * Read on the LONGITUDE arc, not on houses. Ketu is Rahu + 180, so the zodiac splits into two
 * halves: Rahu -> Ketu (going forward from Rahu) and Ketu -> Rahu. All 7 planets (Sun to Saturn)
 * in one half = full Kaal Sarp; exactly 1 outside = partial. A planet that shares a node's sign
 * but has not reached the node (or is past it) is outside, which the old house test counted as
 * inside (SB4).
 *
 * Direction, one convention for Aroha: the planets between Rahu and Ketu = Kaal Sarp; between
 * Ketu and Rahu = Kaal Amrit (the common modern naming). Kaal Sarp itself is a later tradition,
 * not a rule of the old Parashari texts, and the direction naming is the same, so both are shown
 * as such. The 12 named types still come from Rahu's and Ketu's houses.
 */

const SEVEN_PLANETS: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

/** Degrees travelled forward from `from` to `to`, 0 up to (not including) 360. */
function forwardArc(from: number, to: number): number {
  return (((to - from) % 360) + 360) % 360;
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
      direction: 'none',
      outsidePlanets: [],
      description: '',
    };
  }

  const rahuHouse = rahu.house;
  const ketuHouse = ketu.house;

  // Rahu -> Ketu is the forward half from Rahu's longitude; the rest is Ketu -> Rahu.
  const onRahuSide: Planet[] = [];
  const onKetuSide: Planet[] = [];
  for (const planet of SEVEN_PLANETS) {
    const pos = chartData.planets.find((p) => p.planet === planet);
    if (!pos) continue;
    if (forwardArc(rahu.longitude, pos.longitude) < 180) onRahuSide.push(planet);
    else onKetuSide.push(planet);
  }

  let isPresent = false;
  let isPartial = false;
  let direction: KaalSarpDosha['direction'] = 'none';
  let outsidePlanets: Planet[] = [];

  if (onKetuSide.length === 0 || onRahuSide.length === 0) {
    isPresent = true;
    direction = onKetuSide.length === 0 ? 'kaal_sarp' : 'kaal_amrit';
  } else if (onKetuSide.length === 1 || onRahuSide.length === 1) {
    isPresent = true;
    isPartial = true;
    direction = onKetuSide.length === 1 ? 'kaal_sarp' : 'kaal_amrit';
    outsidePlanets = direction === 'kaal_sarp' ? onKetuSide : onRahuSide;
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
      direction: 'none',
      outsidePlanets: [],
      description: '',
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

  const directionName =
    direction === 'kaal_amrit'
      ? 'Kaal Amrit (planets between Ketu and Rahu)'
      : 'Kaal Sarp (planets between Rahu and Ketu)';
  const description = isPartial
    ? `A partial ${name}, read as ${directionName}: nearly all planets are hemmed on one side of the Rahu-Ketu axis (Rahu house ${rahuHouse}, Ketu house ${ketuHouse}), with ${outsidePlanets.join(', ')} outside the arc, which softens the dosha's intensity.`
    : `${name}, read as ${directionName}: every planet lies on one side of the Rahu-Ketu axis (Rahu house ${rahuHouse}, Ketu house ${ketuHouse}), the full form of Kaal Sarp Dosha, a later tradition rather than a rule of the old Parashari texts.`;

  return {
    present: true,
    type: typeKey,
    name,
    severity,
    rahuHouse,
    ketuHouse,
    isPartial,
    direction,
    outsidePlanets,
    description,
  };
}
