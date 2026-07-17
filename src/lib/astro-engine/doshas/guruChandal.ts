// @ts-nocheck
import type { ChartData, GuruChandalDosha, Planet } from '@aroha-astrology/shared';

/**
 * Guru Chandal Dosha Detection
 *
 * Jupiter conjunct Rahu OR Jupiter conjunct Ketu in the same house.
 * This affliction taints Jupiter's benefic nature.
 */

function getPlanetPosition(chartData: ChartData, planet: Planet) {
  return chartData.planets.find((p) => p.planet === planet);
}

export function detectGuruChandalDosha(chartData: ChartData): GuruChandalDosha {
  const jupiter = getPlanetPosition(chartData, 'Jupiter');
  const rahu = getPlanetPosition(chartData, 'Rahu');
  const ketu = getPlanetPosition(chartData, 'Ketu');

  if (!jupiter) {
    return {
      present: false,
      house: 0,
      severity: 'none',
      description: '',
    };
  }

  const jupiterHouse = jupiter.house;

  const conjunctRahu = rahu ? jupiter.house === rahu.house : false;
  const conjunctKetu = ketu ? jupiter.house === ketu.house : false;

  const present = conjunctRahu || conjunctKetu;

  let severity: GuruChandalDosha['severity'] = 'none';
  if (present) {
    // Conjunction with Rahu is traditionally considered more severe
    severity = conjunctRahu ? 'severe' : 'moderate';
  }

  const shadowPlanet = conjunctRahu ? 'Rahu' : 'Ketu';
  const description = present
    ? `Jupiter is conjunct ${shadowPlanet} in house ${jupiterHouse}, forming Guru Chandal Dosha — this can cloud Jupiter's wisdom and guidance with ${shadowPlanet}'s illusion or detachment in that house's life area.`
    : '';

  return {
    present,
    house: present ? jupiterHouse : 0,
    severity,
    description,
  };
}
