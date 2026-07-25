// @ts-nocheck
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
 *
 * Cancellation: classically, any ONE qualifying rule below (own sign,
 * exaltation, a benefic conjunction/aspect, or a documented house+sign
 * exception at any of the 3 reference points) is independently sufficient
 * to cancel the dosha — stacking multiple reasons doesn't make a dosha
 * "more cancelled." This intentionally does NOT gate cancellation behind a
 * minimum count of matched rules.
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
  house: number,
): Planet[] {
  return chartData.planets
    .filter((p) => getHouseFromSign(p.signIndex, referenceSignIndex) === house)
    .map((p) => p.planet);
}

function isAspectedBy(
  chartData: ChartData,
  targetSignIndex: number,
  aspectingPlanet: Planet,
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

/**
 * Documented classical house+sign exceptions: Mars in this house (from a
 * given reference point) in one of these signs is a specific cancellation,
 * independent of the general dignity/conjunction/aspect rules below.
 */
const HOUSE_SIGN_EXCEPTIONS: Record<number, ZodiacSign[]> = {
  2: ['Gemini', 'Virgo'],
  7: ['Cancer', 'Capricorn'],
  8: ['Sagittarius', 'Pisces'],
  12: ['Taurus', 'Libra'],
};

function checkCancellations(chartData: ChartData): string[] {
  const cancellations: string[] = [];
  const mars = getPlanetPosition(chartData, 'Mars');
  if (!mars) return cancellations;

  const marsSign = mars.sign;
  const marsSignIndex = mars.signIndex;

  // 1. Mars in own sign (Aries or Scorpio) — dignity is reference-point
  // independent: Mars's actual zodiacal sign doesn't change with Lagna/
  // Moon/Venus, so this alone is a complete, unconditional cancellation.
  if (PLANET_OWN_SIGNS.Mars.includes(marsSign)) {
    cancellations.push(`Mars in own sign ${marsSign} - cancellation applies`);
  }

  // 2. Mars exalted (Capricorn)
  if (PLANET_EXALTATION.Mars && marsSign === PLANET_EXALTATION.Mars.sign) {
    cancellations.push('Mars exalted in Capricorn - cancellation applies');
  }

  // 3. Mars conjunct (same house/sign) a benefic (Jupiter or Venus)
  const planetsInMarsSign = chartData.planets.filter(
    (p) => p.signIndex === marsSignIndex && p.planet !== 'Mars',
  );
  const beneficConjunctions = planetsInMarsSign.filter(
    (p) => p.planet === 'Jupiter' || p.planet === 'Venus',
  );
  if (beneficConjunctions.length > 0) {
    const names = beneficConjunctions.map((p) => p.planet).join(', ');
    cancellations.push(`Mars conjunct benefic (${names}) - cancellation applies`);
  }

  // 4. Mars aspected by Jupiter
  if (isAspectedBy(chartData, marsSignIndex, 'Jupiter')) {
    cancellations.push('Mars aspected by Jupiter - cancellation applies');
  }

  // 5. Mars conjunct Moon (same sign)
  const moonConjunct = planetsInMarsSign.some((p) => p.planet === 'Moon');
  if (moonConjunct) {
    cancellations.push('Mars conjunct Moon - cancellation applies');
  }

  // 6. Spouse chart also has Mangal Dosha - cannot be checked from single
  // chart; handled at the two-chart matchmaking layer, not here.

  // 7. Documented house+sign exceptions (2nd/7th/8th/12th), checked from
  // EACH of the 3 reference points (Lagna, Moon, Venus) — not just Lagna.
  const moon = getPlanetPosition(chartData, 'Moon');
  const venus = getPlanetPosition(chartData, 'Venus');
  const referencePoints: { label: string; signIndex: number }[] = [
    { label: 'Lagna', signIndex: chartData.ascendant.signIndex },
    ...(moon ? [{ label: 'Moon', signIndex: moon.signIndex }] : []),
    ...(venus ? [{ label: 'Venus', signIndex: venus.signIndex }] : []),
  ];
  for (const ref of referencePoints) {
    const house = getHouseFromSign(marsSignIndex, ref.signIndex);
    const exceptedSigns = HOUSE_SIGN_EXCEPTIONS[house];
    if (exceptedSigns && exceptedSigns.includes(marsSign)) {
      cancellations.push(
        `Mars in house ${house} from ${ref.label} in ${marsSign} - cancellation applies`,
      );
    }
  }

  return cancellations;
}

function computeAge(birthDate: string, asOf: Date = new Date()): number {
  const birth = new Date(birthDate);
  let age = asOf.getFullYear() - birth.getFullYear();
  const monthDiff = asOf.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function buildDescription(
  present: boolean,
  type: MangalDosha['type'],
  marsHouseFromLagna: number,
  fromLagna: boolean,
  fromMoon: boolean,
  fromVenus: boolean,
  cancellations: string[],
): string {
  if (!present) return '';

  const refs = [fromLagna && 'Lagna', fromMoon && 'Moon', fromVenus && 'Venus'].filter(
    Boolean,
  ) as string[];
  const refText = refs.join(', ');

  if (type === 'cancelled') {
    const reason =
      cancellations[0]?.replace(/ - cancellation applies$/, '') ?? 'a classical exception';
    return `Mars sits in house ${marsHouseFromLagna} from your ${refText}, which would normally form Mangal Dosha, but ${reason} — a classical cancellation that substantially neutralizes its effect.`;
  }
  if (type === 'full') {
    return `Mars afflicts all three reference points (Lagna, Moon, and Venus) from house ${marsHouseFromLagna}, forming a full Mangal Dosha with no cancellation — traditionally significant for marriage timing and marital harmony.`;
  }
  return `Mars in house ${marsHouseFromLagna} afflicts your ${refText}, forming a partial Mangal Dosha (${refs.length} of 3 reference points affected).`;
}

export function detectMangalDosha(chartData: ChartData, birthDate?: string): MangalDosha {
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
      description: '',
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

  // Any ONE matched classical cancellation rule is sufficient to cancel the
  // dosha — this is not gated behind a minimum count of stacked reasons (see
  // the module doc comment for why).
  const isCancelled = cancellations.length > 0;

  let severity: MangalDosha['severity'] = 'none';
  if (present && !isCancelled) {
    if (afflictedCount === 3) severity = 'severe';
    else if (afflictedCount === 2) severity = 'moderate';
    else severity = 'mild';
  }

  let type: MangalDosha['type'] = 'none';
  if (!present) {
    type = 'none';
  } else if (isCancelled) {
    type = 'cancelled';
  } else if (afflictedCount === 3) {
    type = 'full';
  } else {
    type = 'partial';
  }

  let description = buildDescription(
    present,
    type,
    marsHouseFromLagna,
    fromLagna,
    fromMoon,
    fromVenus,
    cancellations,
  );

  // Non-authoritative folk belief: never gates type/severity, only ever adds
  // an informational note to the description when a birth date is supplied.
  if (present && birthDate && computeAge(birthDate) >= 28) {
    description +=
      ' Note: some practitioners informally consider Mangal Dosha to weaken after age 28, though this belief has no basis in classical texts — treat it as a cultural note, not an astrological rule.';
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
    description,
  };
}
