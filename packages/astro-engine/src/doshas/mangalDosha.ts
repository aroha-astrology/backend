import type { ChartData, MangalDosha, Planet, ZodiacSign } from '@aroha-astrology/shared';
import {
  ZODIAC_SIGNS,
  NATURAL_BENEFICS,
  PLANET_EXALTATION,
  PLANET_OWN_SIGNS,
  SIGN_LORDS,
} from '@aroha-astrology/shared';

/**
 * Mangal (Mars) Dosha Detection
 *
 * Mars in houses 1, 2, 4, 7, 8, or 12 from Lagna, Moon, or Venus
 * creates Mangal Dosha (Kuja Dosha). Severity is based on how many
 * reference points (Lagna, Moon, Venus) are afflicted.
 * 10 classical cancellation rules are checked.
 */

const MANGAL_DOSHA_HOUSES = [1, 2, 4, 7, 8, 12];

/** Compute house number of a planet relative to a reference sign index (0-based). */
function getHouseFromSign(planetSignIndex: number, referenceSignIndex: number): number {
  return ((planetSignIndex - referenceSignIndex + 12) % 12) + 1;
}

function getPlanetPosition(chartData: ChartData, planet: Planet) {
  return chartData.planets.find((p) => p.planet === planet);
}

function getPlanetsInHouseFromSign(
  chartData: ChartData,
  referenceSignIndex: number,
  house: number
): Planet[] {
  return chartData.planets
    .filter((p) => getHouseFromSign(p.signIndex, referenceSignIndex) === house)
    .map((p) => p.planet);
}

function isAspectedBy(
  chartData: ChartData,
  targetSignIndex: number,
  aspectingPlanet: Planet
): boolean {
  const aspector = getPlanetPosition(chartData, aspectingPlanet);
  if (!aspector) return false;

  // Standard Vedic aspects: all planets aspect 7th house from themselves
  // Jupiter additionally aspects 5th and 9th
  const aspectedHouses: number[] = [7];
  if (aspectingPlanet === 'Jupiter') {
    aspectedHouses.push(5, 9);
  }
  if (aspectingPlanet === 'Mars') {
    aspectedHouses.push(4, 8);
  }
  if (aspectingPlanet === 'Saturn') {
    aspectedHouses.push(3, 10);
  }

  for (const offset of aspectedHouses) {
    const aspectedSignIndex = (aspector.signIndex + offset - 1) % 12;
    if (aspectedSignIndex === targetSignIndex) return true;
  }
  return false;
}

function checkCancellations(chartData: ChartData): string[] {
  const cancellations: string[] = [];
  const mars = getPlanetPosition(chartData, 'Mars');
  if (!mars) return cancellations;

  const marsSign = mars.sign;
  const marsSignIndex = mars.signIndex;

  // 1. Mars in own sign (Aries or Scorpio)
  if (PLANET_OWN_SIGNS.Mars.includes(marsSign)) {
    cancellations.push(`Mars in own sign ${marsSign} - cancellation applies`);
  }

  // 2. Mars exalted (Capricorn)
  if (PLANET_EXALTATION.Mars && marsSign === PLANET_EXALTATION.Mars.sign) {
    cancellations.push('Mars exalted in Capricorn - cancellation applies');
  }

  // 3. Mars conjunct (same house/sign) a benefic (Jupiter or Venus)
  const planetsInMarsSign = chartData.planets.filter(
    (p) => p.signIndex === marsSignIndex && p.planet !== 'Mars'
  );
  const beneficConjunctions = planetsInMarsSign.filter(
    (p) => p.planet === 'Jupiter' || p.planet === 'Venus'
  );
  if (beneficConjunctions.length > 0) {
    const names = beneficConjunctions.map((p) => p.planet).join(', ');
    cancellations.push(`Mars conjunct benefic (${names}) - cancellation applies`);
  }

  // 4. Mars aspected by Jupiter
  if (isAspectedBy(chartData, marsSignIndex, 'Jupiter')) {
    cancellations.push('Mars aspected by Jupiter - cancellation applies');
  }

  // 5. Mars in Leo or Aquarius
  if (marsSign === 'Leo' || marsSign === 'Aquarius') {
    cancellations.push(`Mars in ${marsSign} - cancellation applies`);
  }

  // 6. Mars conjunct Moon (same sign)
  const moonConjunct = planetsInMarsSign.some((p) => p.planet === 'Moon');
  if (moonConjunct) {
    cancellations.push('Mars conjunct Moon - cancellation applies');
  }

  // 7. Spouse chart also has Mangal Dosha - cannot be checked from single chart
  // This is noted but requires external data; skip deterministic check.

  // 8. Mars in Kendra (1,4,7,10) from Jupiter
  const jupiter = getPlanetPosition(chartData, 'Jupiter');
  if (jupiter) {
    const marsHouseFromJupiter = getHouseFromSign(marsSignIndex, jupiter.signIndex);
    if ([1, 4, 7, 10].includes(marsHouseFromJupiter)) {
      cancellations.push(
        `Mars in Kendra (house ${marsHouseFromJupiter}) from Jupiter - cancellation applies`
      );
    }
  }

  // 9. Mars in 2nd house from Lagna in Gemini or Virgo
  const lagnaSignIndex = chartData.ascendant.signIndex;
  const marsHouseFromLagna = getHouseFromSign(marsSignIndex, lagnaSignIndex);
  if (marsHouseFromLagna === 2 && (marsSign === 'Gemini' || marsSign === 'Virgo')) {
    cancellations.push(`Mars in 2nd house in ${marsSign} - cancellation applies`);
  }

  // 10. Mars in 12th house from Lagna in Taurus or Libra
  if (marsHouseFromLagna === 12 && (marsSign === 'Taurus' || marsSign === 'Libra')) {
    cancellations.push(`Mars in 12th house in ${marsSign} - cancellation applies`);
  }

  return cancellations;
}

export function detectMangalDosha(chartData: ChartData): MangalDosha {
  const mars = getPlanetPosition(chartData, 'Mars');

  if (!mars) {
    return {
      present: false,
      severity: 'none',
      percentage: 0,
      fromLagna: false,
      fromMoon: false,
      fromVenus: false,
      marsHouseFromLagna: 0,
      marsHouseFromMoon: 0,
      marsHouseFromVenus: 0,
      cancellations: [],
      type: 'none',
    };
  }

  const lagnaSignIndex = chartData.ascendant.signIndex;
  const moon = getPlanetPosition(chartData, 'Moon');
  const venus = getPlanetPosition(chartData, 'Venus');

  const marsSignIndex = mars.signIndex;

  const marsHouseFromLagna = getHouseFromSign(marsSignIndex, lagnaSignIndex);
  const marsHouseFromMoon = moon ? getHouseFromSign(marsSignIndex, moon.signIndex) : 0;
  const marsHouseFromVenus = venus ? getHouseFromSign(marsSignIndex, venus.signIndex) : 0;

  const fromLagna = MANGAL_DOSHA_HOUSES.includes(marsHouseFromLagna);
  const fromMoon = moon ? MANGAL_DOSHA_HOUSES.includes(marsHouseFromMoon) : false;
  const fromVenus = venus ? MANGAL_DOSHA_HOUSES.includes(marsHouseFromVenus) : false;

  const afflictedCount = [fromLagna, fromMoon, fromVenus].filter(Boolean).length;
  const present = afflictedCount > 0;

  // Percentage: each reference point contributes ~33.33%
  const percentage = Math.round((afflictedCount / 3) * 100);

  const cancellations = present ? checkCancellations(chartData) : [];

  let severity: MangalDosha['severity'] = 'none';
  if (present && cancellations.length === 0) {
    if (afflictedCount === 3) severity = 'severe';
    else if (afflictedCount === 2) severity = 'moderate';
    else severity = 'mild';
  } else if (present && cancellations.length > 0) {
    // Cancellations reduce severity
    if (cancellations.length >= 3) severity = 'none';
    else if (afflictedCount === 3 && cancellations.length < 3) severity = 'moderate';
    else if (afflictedCount === 2 && cancellations.length < 2) severity = 'mild';
    else severity = 'mild';
  }

  let type: MangalDosha['type'] = 'none';
  if (!present) {
    type = 'none';
  } else if (cancellations.length >= 3) {
    type = 'cancelled';
  } else if (afflictedCount === 3) {
    type = 'full';
  } else {
    type = 'partial';
  }

  return {
    present,
    severity,
    percentage,
    fromLagna,
    fromMoon,
    fromVenus,
    marsHouseFromLagna,
    marsHouseFromMoon,
    marsHouseFromVenus,
    cancellations,
    type,
  };
}
