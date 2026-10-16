// =============================================================================
// Benefic and malefic planets
// =============================================================================
// Bṛhat Jātaka 2.5 (source register BJ-2.5):
//   kṣīṇa-indv-arka-mahīsuta-arkatanayāḥ pāpā budhas tair yutaḥ
// "The waning Moon, the Sun, Mars and Saturn are malefic; Mercury is malefic
// when joined with them." Jupiter and Venus, the Moon while waxing, and
// Mercury when it is not joined with those four are benefic.
//
// This replaces a fixed list that made the Moon and Mercury benefic in every
// chart. The text says nothing about Rāhu and Ketu; they stay malefic by
// Aroha's convention (ANCIENT SOURCE NOT VERIFIED), and they do not count as
// Mercury's malefic company because the verse does not name them.
// =============================================================================

import type { ChartData, Planet } from '@aroha-astrology/shared';

export type Nature = 'benefic' | 'malefic';

const SEVEN: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

function longitudeOf(chart: ChartData, planet: Planet): number | undefined {
  return chart.planets.find((p) => p.planet === planet)?.longitude;
}

function signIndexOf(chart: ChartData, planet: Planet): number | undefined {
  return chart.planets.find((p) => p.planet === planet)?.signIndex;
}

/**
 * The Moon is waning when it is more than 180 degrees ahead of the Sun (the
 * dark half, Kṛṣṇa pakṣa). Exactly 180 is full and counts as bright, as Paksha
 * Bala in shadbala.ts counts it. A chart with no Sun or Moon is not waning.
 */
export function isWaningMoon(chart: ChartData): boolean {
  const sun = longitudeOf(chart, 'Sun');
  const moon = longitudeOf(chart, 'Moon');
  if (sun === undefined || moon === undefined) return false;
  const elongation = (((moon - sun) % 360) + 360) % 360;
  return elongation > 180;
}

/** The four planets whose company makes Mercury malefic (BJ 2.5). */
function maleficCompanyOfMercury(chart: ChartData): Planet[] {
  const company: Planet[] = ['Sun', 'Mars', 'Saturn'];
  if (isWaningMoon(chart)) company.push('Moon');
  return company;
}

/** Benefic or malefic for this chart, at birth. */
export function natureOf(planet: Planet, chart: ChartData): Nature {
  switch (planet) {
    case 'Sun':
    case 'Mars':
    case 'Saturn':
    case 'Rahu':
    case 'Ketu':
      return 'malefic';
    case 'Moon':
      return isWaningMoon(chart) ? 'malefic' : 'benefic';
    case 'Mercury': {
      const mercury = signIndexOf(chart, 'Mercury');
      if (mercury === undefined) return 'benefic';
      const joined = maleficCompanyOfMercury(chart).some(
        (other) => signIndexOf(chart, other) === mercury,
      );
      return joined ? 'malefic' : 'benefic';
    }
    default:
      return 'benefic';
  }
}

/** Which of the seven planets are benefic in this chart. */
export function beneficsOf(chart: ChartData): Planet[] {
  return SEVEN.filter((p) => natureOf(p, chart) === 'benefic');
}
