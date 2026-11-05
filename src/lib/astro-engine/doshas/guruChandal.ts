// @ts-nocheck
import type { ChartData, GuruChandalDosha, Planet } from '@aroha-astrology/shared';

/**
 * Guru Chandal Dosha Detection
 *
 * Jupiter conjunct Rahu in the same house. This affliction taints Jupiter's benefic nature.
 *
 * Jupiter with Ketu is NOT Guru Chandal (audit Sprint 9, G11): the Chandala is Rahu, and no
 * classical verse names Jupiter-Ketu. It used to show as a "moderate" Guru Chandal.
 */

import { separationDeg } from './separation';

function getPlanetPosition(chartData: ChartData, planet: Planet) {
  return chartData.planets.find((p) => p.planet === planet);
}

export function detectGuruChandalDosha(chartData: ChartData): GuruChandalDosha {
  const jupiter = getPlanetPosition(chartData, 'Jupiter');
  const rahu = getPlanetPosition(chartData, 'Rahu');

  if (!jupiter) {
    return {
      present: false,
      house: 0,
      severity: 'none',
      separationDeg: null,
      description: '',
    };
  }

  const jupiterHouse = jupiter.house;

  const present = rahu ? jupiter.house === rahu.house : false;

  // Conjunction with Rahu is the whole rule, and the severe one.
  const severity: GuruChandalDosha['severity'] = present ? 'severe' : 'none';

  const description = present
    ? `Jupiter is conjunct Rahu in house ${jupiterHouse}, forming Guru Chandal Dosha — this can cloud Jupiter's wisdom and guidance with Rahu's illusion in that house's life area.`
    : '';

  return {
    present,
    house: present ? jupiterHouse : 0,
    severity,
    // True angular distance from Rahu, shown as data only (audit G2); the same-house rule decides.
    separationDeg: present && rahu ? separationDeg(jupiter.longitude, rahu.longitude) : null,
    description,
  };
}
