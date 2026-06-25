// @ts-nocheck
import type { ChartData, PitraDosha, Planet, ZodiacSign } from '@aroha-astrology/shared';
import {
  NATURAL_MALEFICS,
  PLANET_DEBILITATION,
  SIGN_LORDS,
  ZODIAC_SIGNS,
} from '@aroha-astrology/shared';

/**
 * Pitra Dosha Detection
 *
 * Conditions:
 * 1. Sun conjunct Rahu (same house)
 * 2. 9th house from Lagna afflicted by malefics
 * 3. 9th lord debilitated
 *
 * Any of these conditions creates Pitra Dosha.
 */

function getPlanetPosition(chartData: ChartData, planet: Planet) {
  return chartData.planets.find((p) => p.planet === planet);
}

function getHouseFromLagna(signIndex: number, lagnaSignIndex: number): number {
  return ((signIndex - lagnaSignIndex + 12) % 12) + 1;
}

export function detectPitraDosha(chartData: ChartData): PitraDosha {
  const indicators: string[] = [];
  const lagnaSignIndex = chartData.ascendant.signIndex;

  // Condition 1: Sun + Rahu conjunction (same house)
  const sun = getPlanetPosition(chartData, 'Sun');
  const rahu = getPlanetPosition(chartData, 'Rahu');

  if (sun && rahu && sun.house === rahu.house) {
    indicators.push('Sun conjunct Rahu in the same house - ancestral affliction');
  }

  // Condition 2: 9th house afflicted by malefics
  const ninthHouseSignIndex = (lagnaSignIndex + 8) % 12;
  const maleficsInNinth = chartData.planets.filter(
    (p) =>
      NATURAL_MALEFICS.includes(p.planet) &&
      getHouseFromLagna(p.signIndex, lagnaSignIndex) === 9
  );
  if (maleficsInNinth.length > 0) {
    const names = maleficsInNinth.map((p) => p.planet).join(', ');
    indicators.push(`9th house afflicted by malefic(s): ${names}`);
  }

  // Condition 3: 9th lord debilitated
  const ninthSign = ZODIAC_SIGNS[ninthHouseSignIndex];
  const ninthLord = SIGN_LORDS[ninthSign];
  const ninthLordPosition = getPlanetPosition(chartData, ninthLord);

  if (ninthLordPosition) {
    const debilitation = PLANET_DEBILITATION[ninthLord];
    if (debilitation && ninthLordPosition.sign === debilitation.sign) {
      indicators.push(
        `9th lord ${ninthLord} is debilitated in ${ninthLordPosition.sign}`
      );
    }
  }

  const present = indicators.length > 0;

  let severity: PitraDosha['severity'] = 'none';
  if (indicators.length >= 3) {
    severity = 'severe';
  } else if (indicators.length === 2) {
    severity = 'moderate';
  } else if (indicators.length === 1) {
    severity = 'mild';
  }

  return {
    present,
    indicators,
    severity,
  };
}

