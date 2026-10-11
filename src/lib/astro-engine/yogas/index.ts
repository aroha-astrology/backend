// @ts-nocheck
import type {
  ChartData,
  Yoga,
  YogaType,
  Planet,
  ZodiacSign,
  PlanetPosition,
} from '@aroha-astrology/shared';

import { isCombust } from '../calculations/planet-state.js';
import { aspectsHouse, houseFrom, isKendraFrom } from '../rules/houses.js';
import { isDayChart } from '../rules/day.js';
import { beneficsOf, natureOf } from '../rules/nature.js';
import { assessKemadruma } from '../doshas/kemDrumaDosha.js';
import { getActiveProfile } from '../rules/profile.js';
import { signDignity } from '../rules/dignity.js';

import {
  ZODIAC_SIGNS,
  SIGN_LORDS,
  PLANET_EXALTATION,
  PLANET_DEBILITATION,
  PLANET_OWN_SIGNS,
  PLANET_FRIENDS,
  PLANET_ENEMIES,
  NATURAL_BENEFICS,
  NATURAL_MALEFICS,
} from '@aroha-astrology/shared';

// ============================================================
// Helper Functions
// ============================================================

const SEVEN_PLANETS: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

/**
 * The benefics meant in the Moon yogas of Bṛhat Jātaka chapter 13 (Adhi,
 * Vasumati): Mercury, Jupiter and Venus. The Moon is the point they are
 * counted from, so it is not one of them.
 */
const MOON_YOGA_BENEFICS: Planet[] = ['Mercury', 'Jupiter', 'Venus'];

/** Get a planet's position record from chart data. */
function getPlanetPosition(planet: Planet, chartData: ChartData): PlanetPosition | undefined {
  return chartData.planets.find((p) => p.planet === planet);
}

/** Get the house number (1-12) a planet occupies. */
function getPlanetHouse(planet: Planet, chartData: ChartData): number {
  const pos = getPlanetPosition(planet, chartData);
  return pos ? pos.house : 0;
}

/** Get the zodiac sign a planet occupies. */
function getPlanetSign(planet: Planet, chartData: ChartData): ZodiacSign {
  const pos = getPlanetPosition(planet, chartData);
  return pos ? pos.sign : 'Aries';
}

/** Is the house a Kendra (angular) house? */
function isInKendra(house: number): boolean {
  return house === 1 || house === 4 || house === 7 || house === 10;
}

/** Is the house a Trikona (trinal) house? */
function isInTrikona(house: number): boolean {
  return house === 1 || house === 5 || house === 9;
}

/** Is the house a Kendra or Trikona? */
function isInKendraOrTrikona(house: number): boolean {
  return isInKendra(house) || isInTrikona(house);
}

/** Is the planet exalted in the given sign? */
function isPlanetExalted(planet: Planet, sign: ZodiacSign): boolean {
  const exaltation = PLANET_EXALTATION[planet];
  return exaltation ? exaltation.sign === sign : false;
}

/** Is the planet in its own sign? */
function isPlanetInOwnSign(planet: Planet, sign: ZodiacSign): boolean {
  const ownSigns = PLANET_OWN_SIGNS[planet];
  return ownSigns ? ownSigns.includes(sign) : false;
}

/** Is the planet debilitated in the given sign? */
function isPlanetDebilitated(planet: Planet, sign: ZodiacSign): boolean {
  const debilitation = PLANET_DEBILITATION[planet];
  return debilitation ? debilitation.sign === sign : false;
}

/** Get the lord of a given house number (1-12) from chart data. */
function getHouseLord(houseNum: number, chartData: ChartData): Planet {
  const houseData = chartData.houses.find((h) => h.house === houseNum);
  if (houseData) {
    return houseData.lord;
  }
  // Fallback: use whole-sign from ascendant
  const ascSignIndex = ZODIAC_SIGNS.indexOf(chartData.ascendant.sign);
  const houseSignIndex = (ascSignIndex + houseNum - 1) % 12;
  return SIGN_LORDS[ZODIAC_SIGNS[houseSignIndex]];
}

/** Are two planets conjunct (in the same house)? */
function arePlanetsConjunct(p1: Planet, p2: Planet, chartData: ChartData): boolean {
  const h1 = getPlanetHouse(p1, chartData);
  const h2 = getPlanetHouse(p2, chartData);
  return h1 > 0 && h2 > 0 && h1 === h2;
}

/**
 * Which house `toHouse` is, counted from `fromHouse` the Jyotish way: the same
 * house is the 1st, the opposite house the 7th. This used to return steps
 * (same house = 12, opposite = 6) while every caller below compared it with
 * ordinals, which read each aspect one house late (audit items YG1-YG3).
 */
function houseDistance(fromHouse: number, toHouse: number): number {
  return houseFrom(fromHouse, toHouse);
}

/**
 * Does a planet aspect a target house?
 * Standard Vedic aspects:
 *   - All planets aspect the 7th house from themselves
 *   - Mars additionally aspects 4th and 8th
 *   - Jupiter additionally aspects 5th and 9th
 *   - Saturn additionally aspects 3rd and 10th
 */
function doesPlanetAspect(planet: Planet, targetHouse: number, chartData: ChartData): boolean {
  const planetHouse = getPlanetHouse(planet, chartData);
  if (planetHouse === 0) return false;
  return aspectsHouse(planet, planetHouse, targetHouse);
}

/** Is a planet aspected by a specific other planet? */
function isPlanetAspectedBy(target: Planet, aspector: Planet, chartData: ChartData): boolean {
  const targetHouse = getPlanetHouse(target, chartData);
  if (targetHouse === 0) return false;
  return doesPlanetAspect(aspector, targetHouse, chartData);
}

/** Get the sign index (0-11) for a zodiac sign. */
function signIndex(sign: ZodiacSign): number {
  return ZODIAC_SIGNS.indexOf(sign);
}

/** Is a sign an odd sign (fire/air: Aries, Gemini, Leo, Libra, Sagittarius, Aquarius)? */
function isOddSign(sign: ZodiacSign): boolean {
  const idx = signIndex(sign);
  return idx % 2 === 0; // 0-based index: Aries=0 (odd sign), Taurus=1 (even sign), etc.
}

/** Is a sign an even sign? */
function isEvenSign(sign: ZodiacSign): boolean {
  return !isOddSign(sign);
}

/** Compute planet strength (0-100) based on dignity, retrograde, combustion. */
function computePlanetStrength(planet: Planet, chartData: ChartData): number {
  const pos = getPlanetPosition(planet, chartData);
  if (!pos) return 0;

  const sign = pos.sign;
  let strength = 50; // neutral default

  if (isPlanetExalted(planet, sign)) {
    strength = 90;
  } else if (isPlanetInOwnSign(planet, sign)) {
    strength = 75;
  } else if (isPlanetDebilitated(planet, sign)) {
    strength = 10;
  } else {
    // Check friendly / enemy sign
    const signLord = SIGN_LORDS[sign];
    const friends = PLANET_FRIENDS[planet] || [];
    const enemies = PLANET_ENEMIES[planet] || [];
    if (friends.includes(signLord)) {
      strength = 60;
    } else if (enemies.includes(signLord)) {
      strength = 30;
    }
    // else neutral = 50
  }

  // Retrograde bonus (except Sun and Moon which are never retrograde)
  if (pos.isRetrograde) {
    strength = Math.min(100, strength + 10);
  }

  // Combustion penalty: planet within its orb of the Sun. The orb table used
  // to be inline here; it now lives in calculations/planet-state.ts so the
  // narration layers classify combustion identically (same orbs, same result).
  if (isCombust(planet, pos.longitude, getPlanetPosition('Sun', chartData)?.longitude)) {
    strength = Math.max(0, strength - 20);
  }

  return Math.max(0, Math.min(100, strength));
}

/** Get the house number of a planet relative to another reference planet. */
function houseFromPlanet(
  referencePlanet: Planet,
  targetPlanet: Planet,
  chartData: ChartData,
): number {
  const refHouse = getPlanetHouse(referencePlanet, chartData);
  const targetHouse = getPlanetHouse(targetPlanet, chartData);
  if (refHouse === 0 || targetHouse === 0) return 0;
  return houseDistance(refHouse, targetHouse);
}

/** Get the house number relative to a reference house. */
function houseFromHouse(refHouse: number, targetHouse: number): number {
  return houseDistance(refHouse, targetHouse);
}

/** Get all planets in a specific house. */
function planetsInHouse(house: number, chartData: ChartData): Planet[] {
  return chartData.planets.filter((p) => p.house === house).map((p) => p.planet);
}

/** Check if any benefic aspects a given house. */
function isBeneficAspectingHouse(house: number, chartData: ChartData): boolean {
  return NATURAL_BENEFICS.some((b) => doesPlanetAspect(b, house, chartData));
}

// ============================================================
// Yoga Detection Functions
// ============================================================

// ------ Pancha Mahapurusha Yogas ------

function detectMahapurushaYoga(
  planet: Planet,
  yogaName: string,
  description: string,
  chartData: ChartData,
): Yoga {
  const house = getPlanetHouse(planet, chartData);
  const sign = getPlanetSign(planet, chartData);
  const inKendra = isInKendra(house);
  const exalted = isPlanetExalted(planet, sign);
  const ownSign = isPlanetInOwnSign(planet, sign);
  const present = inKendra && (exalted || ownSign);

  let strength = 0;
  if (present) {
    strength = computePlanetStrength(planet, chartData);
    // Boost if exalted in kendra
    if (exalted) strength = Math.min(100, strength + 5);
  }

  return {
    name: yogaName,
    type: 'mahapurusha',
    present,
    strength,
    description,
    planets: [planet],
    houses: present ? [house] : [],
    activationPeriod: `${planet} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectRuchaka(chartData: ChartData): Yoga {
  return detectMahapurushaYoga(
    'Mars',
    'Ruchaka Yoga',
    'Mars in own or exalted sign in a Kendra house. Grants courage, leadership, authority, and physical prowess.',
    chartData,
  );
}

function detectBhadra(chartData: ChartData): Yoga {
  return detectMahapurushaYoga(
    'Mercury',
    'Bhadra Yoga',
    'Mercury in own or exalted sign in a Kendra house. Grants sharp intellect, eloquence, business acumen, and youthful appearance.',
    chartData,
  );
}

function detectHamsa(chartData: ChartData): Yoga {
  return detectMahapurushaYoga(
    'Jupiter',
    'Hamsa Yoga',
    'Jupiter in own or exalted sign in a Kendra house. Grants wisdom, spirituality, morality, and high social status.',
    chartData,
  );
}

function detectMalavya(chartData: ChartData): Yoga {
  return detectMahapurushaYoga(
    'Venus',
    'Malavya Yoga',
    'Venus in own or exalted sign in a Kendra house. Grants beauty, wealth, artistic talents, luxurious life, and a loving spouse.',
    chartData,
  );
}

function detectShasha(chartData: ChartData): Yoga {
  return detectMahapurushaYoga(
    'Saturn',
    'Shasha Yoga',
    'Saturn in own or exalted sign in a Kendra house. Grants discipline, authority over people, political power, and longevity.',
    chartData,
  );
}

// ------ Raja Yogas ------

function detectDharmaKarmadhipati(chartData: ChartData): Yoga {
  const lord9 = getHouseLord(9, chartData);
  const lord10 = getHouseLord(10, chartData);
  const house9 = getPlanetHouse(lord9, chartData);
  const house10 = getPlanetHouse(lord10, chartData);
  const sign9 = getPlanetSign(lord9, chartData);
  const sign10 = getPlanetSign(lord10, chartData);

  // Conjunction: both lords in same house
  const conjunct = arePlanetsConjunct(lord9, lord10, chartData);

  // Mutual exchange: lord9 in sign owned by lord10 and vice versa
  const lord9InLord10Sign = SIGN_LORDS[sign9] === lord10;
  const lord10InLord9Sign = SIGN_LORDS[sign10] === lord9;
  const exchange = lord9InLord10Sign && lord10InLord9Sign;

  // Mutual aspect
  const mutualAspect =
    doesPlanetAspect(lord9, house10, chartData) && doesPlanetAspect(lord10, house9, chartData);

  const present = conjunct || exchange || mutualAspect;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength(lord9, chartData);
    const s2 = computePlanetStrength(lord10, chartData);
    strength = Math.round((s1 + s2) / 2);
    if (exchange) strength = Math.min(100, strength + 10);
    if (conjunct && isInKendraOrTrikona(house9)) strength = Math.min(100, strength + 5);
  }

  const planets: Planet[] = lord9 === lord10 ? [lord9] : [lord9, lord10];
  const houses: number[] = [];
  if (present) {
    houses.push(house9);
    if (house10 !== house9) houses.push(house10);
  }

  return {
    name: 'Dharma-Karmadhipati Yoga',
    type: 'raja',
    present,
    strength,
    description:
      '9th lord (dharma) and 10th lord (karma) are connected by conjunction, mutual exchange, or mutual aspect. One of the most powerful Raja Yogas bestowing fortune, fame, and high position.',
    planets,
    houses,
    activationPeriod: `${lord9} or ${lord10} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectViparitaRaja(chartData: ChartData): Yoga {
  const lord6 = getHouseLord(6, chartData);
  const lord8 = getHouseLord(8, chartData);
  const lord12 = getHouseLord(12, chartData);

  const house6Lord = getPlanetHouse(lord6, chartData);
  const house8Lord = getPlanetHouse(lord8, chartData);
  const house12Lord = getPlanetHouse(lord12, chartData);

  const dusthanas = [6, 8, 12];

  const lord6InDusthana = dusthanas.includes(house6Lord);
  const lord8InDusthana = dusthanas.includes(house8Lord);
  const lord12InDusthana = dusthanas.includes(house12Lord);

  // At least two of the three dusthana lords must be in dusthana houses
  const count = [lord6InDusthana, lord8InDusthana, lord12InDusthana].filter(Boolean).length;
  const present = count >= 2;

  let strength = 0;
  const involvedPlanets: Planet[] = [];
  const involvedHouses: number[] = [];

  if (present) {
    if (lord6InDusthana) {
      involvedPlanets.push(lord6);
      involvedHouses.push(house6Lord);
    }
    if (lord8InDusthana) {
      involvedPlanets.push(lord8);
      involvedHouses.push(house8Lord);
    }
    if (lord12InDusthana) {
      involvedPlanets.push(lord12);
      involvedHouses.push(house12Lord);
    }
    // Deduplicate
    const uniquePlanets = [...new Set(involvedPlanets)];
    const uniqueHouses = [...new Set(involvedHouses)];
    involvedPlanets.length = 0;
    involvedPlanets.push(...uniquePlanets);
    involvedHouses.length = 0;
    involvedHouses.push(...uniqueHouses);

    const avgStrength =
      involvedPlanets.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) /
      involvedPlanets.length;
    strength = Math.round(avgStrength);
    if (count === 3) strength = Math.min(100, strength + 15);
  }

  return {
    name: 'Viparita Raja Yoga',
    type: 'raja',
    present,
    strength,
    description:
      "Lords of 6th, 8th, and 12th houses placed in dusthana houses (6, 8, 12). Turns adversity into advantage; gains through unexpected events, enemies' losses, or insurance.",
    planets: involvedPlanets,
    houses: involvedHouses,
    activationPeriod:
      involvedPlanets.length > 0
        ? `${involvedPlanets[0]} Mahadasha/Antardasha`
        : (undefined ?? undefined),
  };
}

/**
 * Phaladeepika 7.26-29 (register PD-7.26-29, audit YG6): is the debilitation of
 * `planet` (standing in `sign`) cancelled?
 *  - the lord of the debilitation sign, or the lord of the exaltation sign, in a
 *    kendra from the Lagna or from the Moon (26, 29);
 *  - those two lords in kendras from each other (27);
 *  - the planet aspected by the lord of its debilitation sign (28).
 * "From the Moon" is not used for the Moon itself: a lord that is the Moon is
 * always in its own kendra, which would cancel every debilitated Jupiter.
 */
function neechabhangaByPhaladeepika(
  planet: Planet,
  sign: ZodiacSign,
  chartData: ChartData,
): boolean {
  const exaltData = PLANET_EXALTATION[planet];
  if (!exaltData) return false;
  const debilLord = SIGN_LORDS[sign];
  const exaltLord = SIGN_LORDS[exaltData.sign];
  const moonHouse = getPlanetHouse('Moon', chartData);

  const kendraFromLagnaOrMoon = (lord: Planet): boolean => {
    const h = getPlanetHouse(lord, chartData);
    if (h === 0) return false;
    if (isInKendra(h)) return true;
    return lord !== 'Moon' && moonHouse > 0 && isKendraFrom(moonHouse, h);
  };

  if (kendraFromLagnaOrMoon(debilLord) || kendraFromLagnaOrMoon(exaltLord)) return true;

  const debilLordHouse = getPlanetHouse(debilLord, chartData);
  const exaltLordHouse = getPlanetHouse(exaltLord, chartData);
  if (debilLordHouse > 0 && exaltLordHouse > 0 && isKendraFrom(debilLordHouse, exaltLordHouse)) {
    return true;
  }

  return isPlanetAspectedBy(planet, debilLord, chartData);
}

function detectNeechBhangaRaja(chartData: ChartData): Yoga {
  const involvedPlanets: Planet[] = [];
  const involvedHouses: number[] = [];
  let maxStrength = 0;
  const byText = getActiveProfile().neechabhangaRules === 'phaladeepika';

  for (const pp of chartData.planets) {
    const { planet, sign, house } = pp;
    if (!isPlanetDebilitated(planet, sign)) continue;
    // The text speaks of planets: the seven, not the nodes.
    if (byText && (planet === 'Rahu' || planet === 'Ketu')) continue;

    let cancelled = false;

    if (byText) {
      cancelled = neechabhangaByPhaladeepika(planet, sign, chartData);
      if (cancelled) {
        involvedPlanets.push(planet);
        involvedHouses.push(house);
        const boosted = Math.min(100, computePlanetStrength(planet, chartData) + 30);
        if (boosted > maxStrength) maxStrength = boosted;
      }
      continue;
    }

    // Condition 1: Lord of the sign where the planet is exalted aspects the debilitated planet
    const exaltData = PLANET_EXALTATION[planet];
    if (exaltData) {
      const exaltLord = SIGN_LORDS[exaltData.sign];
      if (isPlanetAspectedBy(planet, exaltLord, chartData)) {
        cancelled = true;
      }
      // Also: lord of exaltation sign is in kendra from lagna
      const exaltLordHouse = getPlanetHouse(exaltLord, chartData);
      if (isInKendra(exaltLordHouse)) {
        cancelled = true;
      }
    }

    // Condition 2: Lord of the sign where planet is debilitated is in kendra from lagna or Moon
    const debilSignLord = SIGN_LORDS[sign];
    const debilLordHouse = getPlanetHouse(debilSignLord, chartData);
    if (isInKendra(debilLordHouse)) {
      cancelled = true;
    }
    const moonHouse = getPlanetHouse('Moon', chartData);
    if (moonHouse > 0) {
      const distFromMoon = houseDistance(moonHouse, debilLordHouse);
      if (distFromMoon === 1 || distFromMoon === 4 || distFromMoon === 7 || distFromMoon === 10) {
        cancelled = true;
      }
    }

    // Condition 3: The debilitated planet is exalted in Navamsa (we don't have navamsa, skip)

    // Condition 4: The debilitated planet is conjunct or aspected by the lord of its exaltation sign
    if (exaltData) {
      const exaltLord = SIGN_LORDS[exaltData.sign];
      if (arePlanetsConjunct(planet, exaltLord, chartData)) {
        cancelled = true;
      }
    }

    // Condition 5: Planet is in kendra from lagna or Moon
    if (isInKendra(house)) {
      // Additional weight but not standalone cancellation
    }

    if (cancelled) {
      involvedPlanets.push(planet);
      involvedHouses.push(house);
      const s = computePlanetStrength(planet, chartData);
      // Neech Bhanga gives a boost: base strength from debilitation gets adjusted upward
      const boosted = Math.min(100, s + 30);
      if (boosted > maxStrength) maxStrength = boosted;
    }
  }

  const present = involvedPlanets.length > 0;

  return {
    name: 'Neech Bhanga Raja Yoga',
    type: 'raja',
    present,
    strength: present ? maxStrength : 0,
    description:
      'A debilitated planet whose debilitation is cancelled by specific conditions. Transforms weakness into extraordinary strength, often giving rise after initial struggles.',
    planets: involvedPlanets,
    houses: involvedHouses,
    activationPeriod:
      involvedPlanets.length > 0
        ? `${involvedPlanets[0]} Mahadasha/Antardasha`
        : (undefined ?? undefined),
  };
}

function detectMahaBhagya(chartData: ChartData): Yoga {
  // MahaBhagya Yoga:
  //   Male: born in daytime, Sun/Moon/Lagna all in odd signs
  //   Female: born at night, Sun/Moon/Lagna all in even signs
  // Day birth = Sun above the horizon, read from the Ascendant degree (the
  // Sun's whole-sign house alone is wrong for up to two hours either side of
  // sunrise and sunset).
  const isDaytime = isDayChart(chartData);

  const sunSign = getPlanetSign('Sun', chartData);
  const moonSign = getPlanetSign('Moon', chartData);
  const lagnaSign = chartData.ascendant.sign;

  const allOdd = isOddSign(sunSign) && isOddSign(moonSign) && isOddSign(lagnaSign);
  const allEven = isEvenSign(sunSign) && isEvenSign(moonSign) && isEvenSign(lagnaSign);

  // We check both male and female conditions; chartData doesn't have gender,
  // so we report if either condition is met.
  const maleCondition = isDaytime && allOdd;
  const femaleCondition = !isDaytime && allEven;
  const present = maleCondition || femaleCondition;

  const variant = maleCondition
    ? 'Male (day birth, odd signs)'
    : 'Female (night birth, even signs)';

  let strength = 0;
  if (present) {
    const sunStr = computePlanetStrength('Sun', chartData);
    const moonStr = computePlanetStrength('Moon', chartData);
    strength = Math.round((sunStr + moonStr) / 2);
  }

  return {
    name: 'MahaBhagya Yoga',
    type: 'raja',
    present,
    strength,
    description: present
      ? `Great fortune yoga. ${variant}. Sun, Moon, and Lagna are aligned for exceptional destiny, fame, and prosperity.`
      : 'MahaBhagya Yoga: Great fortune yoga requiring specific alignment of Sun, Moon, and Lagna in odd/even signs with day/night birth.',
    planets: ['Sun', 'Moon'],
    houses: present ? [getPlanetHouse('Sun', chartData), getPlanetHouse('Moon', chartData)] : [],
  };
}

// ------ Dhana Yogas ------

function detectLakshmi(chartData: ChartData): Yoga {
  const lord9 = getHouseLord(9, chartData);
  const lord9House = getPlanetHouse(lord9, chartData);
  const lord9Sign = getPlanetSign(lord9, chartData);
  const lord9Strong =
    isInKendraOrTrikona(lord9House) &&
    (isPlanetExalted(lord9, lord9Sign) ||
      isPlanetInOwnSign(lord9, lord9Sign) ||
      computePlanetStrength(lord9, chartData) >= 55);

  const venusHouse = getPlanetHouse('Venus', chartData);
  const venusSign = getPlanetSign('Venus', chartData);
  const venusInKendraTrikona = isInKendraOrTrikona(venusHouse);
  const venusStrong =
    venusInKendraTrikona &&
    (isPlanetExalted('Venus', venusSign) || isPlanetInOwnSign('Venus', venusSign));

  const present = lord9Strong && venusStrong;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength(lord9, chartData);
    const s2 = computePlanetStrength('Venus', chartData);
    strength = Math.round((s1 + s2) / 2);
  }

  const planets: Planet[] = lord9 === 'Venus' ? ['Venus'] : [lord9, 'Venus'];

  return {
    name: 'Lakshmi Yoga',
    type: 'dhana',
    present,
    strength,
    description:
      '9th lord strong in Kendra/Trikona and Venus in own/exalted sign in Kendra/Trikona. Bestows immense wealth, prosperity, and the blessings of Goddess Lakshmi.',
    planets,
    houses: present ? [lord9House, venusHouse] : [],
    activationPeriod: `Venus or ${lord9} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectVasumathi(chartData: ChartData): Yoga {
  const moonHouse = getPlanetHouse('Moon', chartData);
  if (moonHouse === 0) {
    return {
      name: 'Vasumathi Yoga',
      type: 'dhana',
      present: false,
      strength: 0,
      description: 'Benefics in 3, 6, 10, 11 from Moon. Bestows wealth and prosperity.',
      planets: [],
      houses: [],
    };
  }

  // Bṛhat Jātaka 13.9 (register BJ-13.9): "lagnād atīva vasumān vasumāñ
  // chaśāṅkāt saumyagrahair upacaya-upagataiḥ samastaiḥ" — ALL the benefics
  // (Mercury, Jupiter, Venus) in the 3rd, 6th, 10th or 11th, counted from the
  // Lagna (very wealthy) or from the Moon (wealthy). The verse counts the
  // benefics, not how many of the four houses are filled; with only two it
  // gives a middling result, which is not flagged as the yoga here.
  const upachaya = [3, 6, 10, 11];
  const fromMoonHouses = upachaya.map((offset) => ((moonHouse + offset - 2) % 12) + 1);

  const inUpachayaFromMoon = MOON_YOGA_BENEFICS.filter((b) =>
    fromMoonHouses.includes(getPlanetHouse(b, chartData)),
  );
  const inUpachayaFromLagna = MOON_YOGA_BENEFICS.filter((b) =>
    upachaya.includes(getPlanetHouse(b, chartData)),
  );
  const fromLagna = inUpachayaFromLagna.length === MOON_YOGA_BENEFICS.length;
  const fromMoon = inUpachayaFromMoon.length === MOON_YOGA_BENEFICS.length;

  const present = fromLagna || fromMoon;
  const beneficsFound: Planet[] = present ? [...MOON_YOGA_BENEFICS] : [];
  const housesFound = [...new Set(beneficsFound.map((b) => getPlanetHouse(b, chartData)))];

  let strength = 0;
  if (present) {
    strength = Math.round(
      beneficsFound.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) /
        beneficsFound.length,
    );
    // The verse ranks the Lagna form above the Moon form.
    if (fromLagna) strength = Math.min(100, strength + 10);
  }

  return {
    name: 'Vasumathi Yoga',
    type: 'dhana',
    present,
    strength,
    description:
      "Mercury, Jupiter and Venus all occupy the 3rd, 6th, 10th or 11th houses from the Lagna or from the Moon. Bestows great wealth accumulated through one's own efforts.",
    planets: beneficsFound,
    houses: housesFound,
    activationPeriod:
      beneficsFound.length > 0
        ? `${beneficsFound[0]} Mahadasha/Antardasha`
        : (undefined ?? undefined),
  };
}

function detectKalanidhi(chartData: ChartData): Yoga {
  const jupiterHouse = getPlanetHouse('Jupiter', chartData);
  const inSecondOrFifth = jupiterHouse === 2 || jupiterHouse === 5;

  if (!inSecondOrFifth) {
    return {
      name: 'Kalanidhi Yoga',
      type: 'dhana',
      present: false,
      strength: 0,
      description:
        'Jupiter in 2nd or 5th house conjunct or aspected by Mercury and Venus. Grants artistic talent and wealth.',
      planets: [],
      houses: [],
    };
  }

  const mercuryConjOrAspect =
    arePlanetsConjunct('Jupiter', 'Mercury', chartData) ||
    isPlanetAspectedBy('Jupiter', 'Mercury', chartData);
  const venusConjOrAspect =
    arePlanetsConjunct('Jupiter', 'Venus', chartData) ||
    isPlanetAspectedBy('Jupiter', 'Venus', chartData);

  const present = inSecondOrFifth && mercuryConjOrAspect && venusConjOrAspect;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength('Jupiter', chartData);
    const s2 = computePlanetStrength('Mercury', chartData);
    const s3 = computePlanetStrength('Venus', chartData);
    strength = Math.round((s1 + s2 + s3) / 3);
  }

  return {
    name: 'Kalanidhi Yoga',
    type: 'dhana',
    present,
    strength,
    description:
      'Jupiter in 2nd or 5th house, conjunct or aspected by Mercury and Venus. Grants immense wealth, artistic talent, knowledge, and cultural refinement.',
    planets: ['Jupiter', 'Mercury', 'Venus'],
    houses: present ? [jupiterHouse] : [],
    activationPeriod: 'Jupiter Mahadasha/Antardasha' ?? undefined,
  };
}

// ------ Lunar Yogas ------

function detectGajakesari(chartData: ChartData): Yoga {
  const moonHouse = getPlanetHouse('Moon', chartData);
  const jupiterHouse = getPlanetHouse('Jupiter', chartData);
  if (moonHouse === 0 || jupiterHouse === 0) {
    return {
      name: 'Gajakesari Yoga',
      type: 'lunar',
      present: false,
      strength: 0,
      description: 'Jupiter in Kendra from Moon. Bestows wisdom, fame, and prosperity.',
      planets: [],
      houses: [],
    };
  }

  const inKendraFromMoon = isKendraFrom(moonHouse, jupiterHouse);
  let present = inKendraFromMoon;
  if (getActiveProfile().gajakesariRule === 'bphs') {
    // BPHS 36.3: a kendra from the Lagna or the Moon, joined or aspected by a
    // benefic, and free of debilitation, combustion and an enemy's house.
    const jupiter = getPlanetPosition('Jupiter', chartData)!;
    const sun = getPlanetPosition('Sun', chartData);
    const placed = inKendraFromMoon || isInKendra(jupiterHouse);
    const supported = beneficsOf(chartData).some(
      (b) =>
        b !== 'Jupiter' &&
        (getPlanetHouse(b, chartData) === jupiterHouse ||
          doesPlanetAspect(b, jupiterHouse, chartData)),
    );
    const dignity = signDignity('Jupiter', jupiter.signIndex);
    const free =
      dignity !== 'debilitated' &&
      dignity !== 'enemy' &&
      !isCombust('Jupiter', jupiter.longitude, sun?.longitude);
    present = placed && supported && free;
  }

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength('Moon', chartData);
    const s2 = computePlanetStrength('Jupiter', chartData);
    strength = Math.round((s1 + s2) / 2);
    // Stronger if Jupiter is exalted or in own sign
    const jupSign = getPlanetSign('Jupiter', chartData);
    if (isPlanetExalted('Jupiter', jupSign) || isPlanetInOwnSign('Jupiter', jupSign)) {
      strength = Math.min(100, strength + 10);
    }
  }

  return {
    name: 'Gajakesari Yoga',
    type: 'lunar',
    present,
    strength,
    description:
      'Jupiter in a Kendra (1, 4, 7, 10) from the Lagna or the Moon, joined or aspected by a benefic, and not debilitated, combust or in an enemy sign (BPHS 36.3). The text promises splendour, wealth, intelligence and favour with rulers.',
    planets: ['Moon', 'Jupiter'],
    houses: [moonHouse, jupiterHouse],
    activationPeriod: 'Jupiter or Moon Mahadasha/Antardasha' ?? undefined,
  };
}

function detectSunapha(chartData: ChartData): Yoga {
  const moonHouse = getPlanetHouse('Moon', chartData);
  if (moonHouse === 0) {
    return {
      name: 'Sunapha Yoga',
      type: 'lunar',
      present: false,
      strength: 0,
      description: 'Planets (excl. Sun, Rahu, Ketu) in 2nd from Moon.',
      planets: [],
      houses: [],
    };
  }

  // Bṛhat Jātaka 13.3-13.4 (register BJ-13.3): planets other than the Sun in
  // the 2nd from the Moon with the 12th empty. With both sides occupied it is
  // Durudhura, not Sunapha as well.
  const secondFromMoon = (moonHouse % 12) + 1;
  const twelfthFromMoon = ((moonHouse - 2 + 12) % 12) + 1;
  const eligible: Planet[] = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  const found = eligible.filter((p) => getPlanetHouse(p, chartData) === secondFromMoon);
  const twelfthOccupied = eligible.some((p) => getPlanetHouse(p, chartData) === twelfthFromMoon);

  const present = found.length > 0 && !twelfthOccupied;
  let strength = 0;
  if (present) {
    strength = Math.round(
      found.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / found.length,
    );
  }

  return {
    name: 'Sunapha Yoga',
    type: 'lunar',
    present,
    strength,
    description:
      'Planet(s) other than Sun, Rahu, Ketu in the 2nd house from Moon. Grants self-acquired wealth, intellect, and royal status.',
    planets: ['Moon', ...found],
    houses: present ? [moonHouse, secondFromMoon] : [],
    activationPeriod:
      found.length > 0 ? `${found[0]} Mahadasha/Antardasha` : (undefined ?? undefined),
  };
}

function detectAnapha(chartData: ChartData): Yoga {
  const moonHouse = getPlanetHouse('Moon', chartData);
  if (moonHouse === 0) {
    return {
      name: 'Anapha Yoga',
      type: 'lunar',
      present: false,
      strength: 0,
      description: 'Planets (excl. Sun, Rahu, Ketu) in 12th from Moon.',
      planets: [],
      houses: [],
    };
  }

  // Bṛhat Jātaka 13.3-13.4 (register BJ-13.3): planets other than the Sun in
  // the 12th from the Moon with the 2nd empty. With both sides occupied it is
  // Durudhura, not Anapha as well.
  const secondFromMoon = (moonHouse % 12) + 1;
  const twelfthFromMoon = ((moonHouse - 2 + 12) % 12) + 1;
  const eligible: Planet[] = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  const found = eligible.filter((p) => getPlanetHouse(p, chartData) === twelfthFromMoon);
  const secondOccupied = eligible.some((p) => getPlanetHouse(p, chartData) === secondFromMoon);

  const present = found.length > 0 && !secondOccupied;
  let strength = 0;
  if (present) {
    strength = Math.round(
      found.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / found.length,
    );
  }

  return {
    name: 'Anapha Yoga',
    type: 'lunar',
    present,
    strength,
    description:
      'Planet(s) other than Sun, Rahu, Ketu in the 12th house from Moon. Grants good health, noble character, and fame.',
    planets: ['Moon', ...found],
    houses: present ? [moonHouse, twelfthFromMoon] : [],
    activationPeriod:
      found.length > 0 ? `${found[0]} Mahadasha/Antardasha` : (undefined ?? undefined),
  };
}

function detectDurudhara(chartData: ChartData): Yoga {
  const moonHouse = getPlanetHouse('Moon', chartData);
  if (moonHouse === 0) {
    return {
      name: 'Durudhara Yoga',
      type: 'lunar',
      present: false,
      strength: 0,
      description: 'Planets in both 2nd and 12th from Moon.',
      planets: [],
      houses: [],
    };
  }

  const secondFromMoon = (moonHouse % 12) + 1;
  const twelfthFromMoon = ((moonHouse - 2 + 12) % 12) + 1;
  const eligible: Planet[] = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

  const inSecond: Planet[] = [];
  const inTwelfth: Planet[] = [];
  for (const p of eligible) {
    const h = getPlanetHouse(p, chartData);
    if (h === secondFromMoon) inSecond.push(p);
    if (h === twelfthFromMoon) inTwelfth.push(p);
  }

  const present = inSecond.length > 0 && inTwelfth.length > 0;
  const allFound = [...inSecond, ...inTwelfth];

  let strength = 0;
  if (present) {
    strength = Math.round(
      allFound.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / allFound.length,
    );
  }

  return {
    name: 'Durudhara Yoga',
    type: 'lunar',
    present,
    strength,
    description:
      'Planets in both 2nd and 12th from Moon (flanking the Moon). Grants wealth, vehicles, property, generous nature, and fame.',
    planets: ['Moon', ...allFound],
    houses: present ? [moonHouse, secondFromMoon, twelfthFromMoon] : [],
    activationPeriod:
      allFound.length > 0 ? `${allFound[0]} Mahadasha/Antardasha` : (undefined ?? undefined),
  };
}

function detectChandraMangal(chartData: ChartData): Yoga {
  const conjunct = arePlanetsConjunct('Moon', 'Mars', chartData);
  const moonHouse = getPlanetHouse('Moon', chartData);

  let strength = 0;
  if (conjunct) {
    const s1 = computePlanetStrength('Moon', chartData);
    const s2 = computePlanetStrength('Mars', chartData);
    strength = Math.round((s1 + s2) / 2);
  }

  return {
    name: 'Chandra-Mangal Yoga',
    type: 'lunar',
    present: conjunct,
    strength,
    description:
      'Moon and Mars conjunction (same house). Grants wealth through self-effort, business acumen, and enterprising nature. Can also indicate a sharp temper.',
    planets: ['Moon', 'Mars'],
    houses: conjunct ? [moonHouse] : [],
    activationPeriod: 'Moon or Mars Mahadasha/Antardasha' ?? undefined,
  };
}

function detectAdhi(chartData: ChartData): Yoga {
  const moonHouse = getPlanetHouse('Moon', chartData);
  if (moonHouse === 0) {
    return {
      name: 'Adhi Yoga',
      type: 'lunar',
      present: false,
      strength: 0,
      description: 'Benefics in 6, 7, 8 from Moon.',
      planets: [],
      houses: [],
    };
  }

  // Bṛhat Jātaka 13.2 (register BJ-13.2): "saumyaiḥ smara-ari-nidhaneṣv
  // adhiyoga indoḥ" — the benefics (Mercury, Jupiter, Venus) in the 7th, 6th
  // and 8th from the Moon. They may share one of the three houses or be spread
  // over them; what the verse asks is that the benefics are there.
  const positions = [6, 7, 8];
  const targetHouses = positions.map((offset) => ((moonHouse + offset - 2) % 12) + 1);

  const found = MOON_YOGA_BENEFICS.filter((b) =>
    targetHouses.includes(getPlanetHouse(b, chartData)),
  );
  const housesFound = [...new Set(found.map((b) => getPlanetHouse(b, chartData)))];

  const present = found.length === MOON_YOGA_BENEFICS.length;

  let strength = 0;
  if (present) {
    strength = Math.round(
      found.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / found.length,
    );
  }

  return {
    name: 'Adhi Yoga',
    type: 'lunar',
    present,
    strength,
    description:
      'Mercury, Jupiter and Venus all in the 6th, 7th or 8th from the Moon. Grants leadership, ministerial position, affluence, and ability to overcome enemies.',
    planets: ['Moon', ...found],
    houses: [moonHouse, ...housesFound],
    activationPeriod:
      found.length > 0 ? `${found[0]} Mahadasha/Antardasha` : (undefined ?? undefined),
  };
}

// ------ Solar Yogas ------

function detectBudhaditya(chartData: ChartData): Yoga {
  const conjunct = arePlanetsConjunct('Sun', 'Mercury', chartData);
  const sunHouse = getPlanetHouse('Sun', chartData);
  const inKendraTrikona = isInKendraOrTrikona(sunHouse);
  const present = conjunct && inKendraTrikona;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength('Sun', chartData);
    const s2 = computePlanetStrength('Mercury', chartData);
    strength = Math.round((s1 + s2) / 2);
    // Mercury combust weakens
    const mercPos = getPlanetPosition('Mercury', chartData);
    const sunPos = getPlanetPosition('Sun', chartData);
    if (mercPos && sunPos) {
      const diff = Math.abs(mercPos.longitude - sunPos.longitude);
      const angDist = diff > 180 ? 360 - diff : diff;
      if (angDist < 3) strength = Math.max(10, strength - 15); // Very close combustion
    }
  }

  return {
    name: 'Budhaditya Yoga',
    type: 'solar',
    present,
    strength,
    description:
      'Sun and Mercury conjunction in a Kendra or Trikona house. Grants intelligence, fame, analytical ability, and success in education and communication.',
    planets: ['Sun', 'Mercury'],
    houses: present ? [sunHouse] : [],
    activationPeriod: 'Sun or Mercury Mahadasha/Antardasha' ?? undefined,
  };
}

function detectVeshi(chartData: ChartData): Yoga {
  const sunHouse = getPlanetHouse('Sun', chartData);
  if (sunHouse === 0) {
    return {
      name: 'Veshi Yoga',
      type: 'solar',
      present: false,
      strength: 0,
      description: 'Planet (excl. Moon, Rahu, Ketu) in 2nd from Sun.',
      planets: [],
      houses: [],
    };
  }

  const secondFromSun = (sunHouse % 12) + 1;
  const eligible: Planet[] = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  const found: Planet[] = [];
  for (const p of eligible) {
    if (getPlanetHouse(p, chartData) === secondFromSun) {
      found.push(p);
    }
  }

  const present = found.length > 0;
  let strength = 0;
  if (present) {
    strength = Math.round(
      found.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / found.length,
    );
  }

  return {
    name: 'Veshi Yoga',
    type: 'solar',
    present,
    strength,
    description:
      'Planet(s) other than Moon, Rahu, Ketu in the 2nd house from Sun. Grants eloquence, wealth, and a respectable position.',
    planets: ['Sun', ...found],
    houses: present ? [sunHouse, secondFromSun] : [],
    activationPeriod:
      found.length > 0 ? `${found[0]} Mahadasha/Antardasha` : (undefined ?? undefined),
  };
}

function detectVoshi(chartData: ChartData): Yoga {
  const sunHouse = getPlanetHouse('Sun', chartData);
  if (sunHouse === 0) {
    return {
      name: 'Voshi Yoga',
      type: 'solar',
      present: false,
      strength: 0,
      description: 'Planet (excl. Moon, Rahu, Ketu) in 12th from Sun.',
      planets: [],
      houses: [],
    };
  }

  const twelfthFromSun = ((sunHouse - 2 + 12) % 12) + 1;
  const eligible: Planet[] = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  const found: Planet[] = [];
  for (const p of eligible) {
    if (getPlanetHouse(p, chartData) === twelfthFromSun) {
      found.push(p);
    }
  }

  const present = found.length > 0;
  let strength = 0;
  if (present) {
    strength = Math.round(
      found.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / found.length,
    );
  }

  return {
    name: 'Voshi Yoga',
    type: 'solar',
    present,
    strength,
    description:
      'Planet(s) other than Moon, Rahu, Ketu in the 12th house from Sun. Grants charitable nature, learning, and a good reputation.',
    planets: ['Sun', ...found],
    houses: present ? [sunHouse, twelfthFromSun] : [],
    activationPeriod:
      found.length > 0 ? `${found[0]} Mahadasha/Antardasha` : (undefined ?? undefined),
  };
}

function detectUbhayachari(chartData: ChartData): Yoga {
  const sunHouse = getPlanetHouse('Sun', chartData);
  if (sunHouse === 0) {
    return {
      name: 'Ubhayachari Yoga',
      type: 'solar',
      present: false,
      strength: 0,
      description: 'Planets in both 2nd and 12th from Sun.',
      planets: [],
      houses: [],
    };
  }

  const secondFromSun = (sunHouse % 12) + 1;
  const twelfthFromSun = ((sunHouse - 2 + 12) % 12) + 1;
  const eligible: Planet[] = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

  const inSecond: Planet[] = [];
  const inTwelfth: Planet[] = [];
  for (const p of eligible) {
    const h = getPlanetHouse(p, chartData);
    if (h === secondFromSun) inSecond.push(p);
    if (h === twelfthFromSun) inTwelfth.push(p);
  }

  const present = inSecond.length > 0 && inTwelfth.length > 0;
  const allFound = [...inSecond, ...inTwelfth];

  let strength = 0;
  if (present) {
    strength = Math.round(
      allFound.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / allFound.length,
    );
  }

  return {
    name: 'Ubhayachari Yoga',
    type: 'solar',
    present,
    strength,
    description:
      'Planets in both 2nd and 12th from Sun (flanking the Sun). Grants royalty, fame, balanced temperament, and all-round prosperity.',
    planets: ['Sun', ...allFound],
    houses: present ? [sunHouse, secondFromSun, twelfthFromSun] : [],
    activationPeriod:
      allFound.length > 0 ? `${allFound[0]} Mahadasha/Antardasha` : (undefined ?? undefined),
  };
}

// ------ Other Yogas ------

function detectSaraswati(chartData: ChartData): Yoga {
  const jupHouse = getPlanetHouse('Jupiter', chartData);
  const venHouse = getPlanetHouse('Venus', chartData);
  const merHouse = getPlanetHouse('Mercury', chartData);

  // Phaladeepika 6.26: Jupiter in exaltation, in its own or in a friendly sign
  // ("possess strength" has no number in the text and is not applied).
  const jupDignity = signDignity('Jupiter', signIndex(getPlanetSign('Jupiter', chartData)));
  const jupInOwnOrExalted =
    jupDignity === 'exalted' || jupDignity === 'own' || jupDignity === 'friend';

  const validHouses = [1, 2, 4, 5, 7, 9, 10]; // kendra + trikona + 2nd
  const jupOk = validHouses.includes(jupHouse);
  const venOk = validHouses.includes(venHouse);
  const merOk = validHouses.includes(merHouse);

  const present = jupOk && venOk && merOk && jupInOwnOrExalted;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength('Jupiter', chartData);
    const s2 = computePlanetStrength('Venus', chartData);
    const s3 = computePlanetStrength('Mercury', chartData);
    strength = Math.round((s1 + s2 + s3) / 3);
  }

  return {
    name: 'Saraswati Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'Jupiter, Venus and Mercury in a Kendra, a Trikona or the 2nd house, with Jupiter in an exalted, own or friendly sign (Phaladeepika 6.26). The text promises learning, skill with words and a good name.',
    planets: ['Jupiter', 'Venus', 'Mercury'],
    houses: present ? [jupHouse, venHouse, merHouse] : [],
    activationPeriod: 'Jupiter Mahadasha/Antardasha' ?? undefined,
  };
}

function detectAmala(chartData: ChartData): Yoga {
  // Benefic in 10th from Lagna or Moon
  const lagnaHouse = 1;
  const moonHouse = getPlanetHouse('Moon', chartData);

  const tenthFromLagna = 10;
  const tenthFromMoon = moonHouse > 0 ? ((moonHouse + 8) % 12) + 1 : 0;

  const found: Planet[] = [];
  const housesFound: number[] = [];

  // A benefic as Bṛhat Jātaka 2.5 defines it for THIS chart: the Moon only while
  // waxing, Mercury only when it keeps no malefic company (rules/nature.ts).
  for (const benefic of beneficsOf(chartData)) {
    const bHouse = getPlanetHouse(benefic, chartData);
    if (bHouse === tenthFromLagna || (tenthFromMoon > 0 && bHouse === tenthFromMoon)) {
      found.push(benefic);
      if (!housesFound.includes(bHouse)) housesFound.push(bHouse);
    }
  }

  const present = found.length > 0;
  let strength = 0;
  if (present) {
    strength = Math.round(
      found.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / found.length,
    );
  }

  return {
    name: 'Amala Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'Natural benefic in the 10th house from Lagna or Moon. Grants a spotless reputation, fame through virtuous deeds, and a charitable nature.',
    planets: found,
    houses: housesFound,
    activationPeriod:
      found.length > 0 ? `${found[0]} Mahadasha/Antardasha` : (undefined ?? undefined),
  };
}

function detectGuruMangala(chartData: ChartData): Yoga {
  const conjunct = arePlanetsConjunct('Jupiter', 'Mars', chartData);
  const jupHouse = getPlanetHouse('Jupiter', chartData);

  let strength = 0;
  if (conjunct) {
    const s1 = computePlanetStrength('Jupiter', chartData);
    const s2 = computePlanetStrength('Mars', chartData);
    strength = Math.round((s1 + s2) / 2);
    // Stronger in kendra/trikona
    if (isInKendraOrTrikona(jupHouse)) strength = Math.min(100, strength + 10);
  }

  return {
    name: 'Guru-Mangala Yoga',
    type: 'benefic',
    present: conjunct,
    strength,
    description:
      'Jupiter and Mars conjunction. Grants courage, righteous action, leadership in spiritual or social causes, and success in competitive endeavors.',
    planets: ['Jupiter', 'Mars'],
    houses: conjunct ? [jupHouse] : [],
    activationPeriod: 'Jupiter or Mars Mahadasha/Antardasha' ?? undefined,
  };
}

/**
 * Phaladeepika 6.57: the lord of a house standing in the 6th, 8th or 12th gives
 * one of twelve yogas, one for each house. Harsha is the 6th lord's, Sarala the
 * 8th lord's, Vimala the 12th lord's (register PD-6.57, audit YG5). The earlier
 * code asked for the lord to be in its own house, which the text does not say.
 */
function lordInDusthana(houseNum: number, chartData: ChartData): { lord: Planet; house: number } {
  const lord = getHouseLord(houseNum, chartData);
  return { lord, house: getPlanetHouse(lord, chartData) };
}

function detectHarsha(chartData: ChartData): Yoga {
  const { lord: lord6, house: lord6House } = lordInDusthana(6, chartData);
  const present = [6, 8, 12].includes(lord6House);

  let strength = 0;
  if (present) {
    strength = computePlanetStrength(lord6, chartData);
  }

  return {
    name: 'Harsha Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'The 6th lord in the 6th, 8th or 12th house (Phaladeepika 6.57). The text promises happiness, a strong constitution, victory over enemies, and friends of standing.',
    planets: [lord6],
    houses: present ? [lord6House] : [],
    activationPeriod: `${lord6} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectSarala(chartData: ChartData): Yoga {
  const { lord: lord8, house: lord8House } = lordInDusthana(8, chartData);
  const present = [6, 8, 12].includes(lord8House);

  let strength = 0;
  if (present) {
    strength = computePlanetStrength(lord8, chartData);
  }

  return {
    name: 'Sarala Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'The 8th lord in the 6th, 8th or 12th house (Phaladeepika 6.57). The text promises a long life, resolve, fearlessness, learning, children and prosperity.',
    planets: [lord8],
    houses: present ? [lord8House] : [],
    activationPeriod: `${lord8} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectVimala(chartData: ChartData): Yoga {
  const { lord: lord12, house: lord12House } = lordInDusthana(12, chartData);
  const present = [6, 8, 12].includes(lord12House);

  let strength = 0;
  if (present) {
    strength = computePlanetStrength(lord12, chartData);
  }

  return {
    name: 'Vimala Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'The 12th lord in the 6th, 8th or 12th house (Phaladeepika 6.57). The text promises small spending and good saving, kindness to everyone, independence and a good name.',
    planets: [lord12],
    houses: present ? [lord12House] : [],
    activationPeriod: `${lord12} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectKemadrumaCanellation(chartData: ChartData): Yoga {
  // Kemadruma is formed when no planet but the Sun is in the 2nd or 12th from
  // the Moon. The cancellation is what the dosha detector says cancels it
  // (Brihat Jataka 13.3: the Moon in an angle from the Lagna, or with a planet;
  // the later exemptions only under the 'later-tradition' profile option), so
  // the yoga and the dosha cannot disagree (audit DS3).
  const moonHouse = getPlanetHouse('Moon', chartData);
  const assessment = assessKemadruma(chartData);
  if (moonHouse === 0 || !assessment) {
    return {
      name: 'Kemadruma Cancellation',
      type: 'benefic',
      present: false,
      strength: 0,
      description:
        'Kemadruma is cancelled when the Moon is in an angle from the Lagna or has a planet with it.',
      planets: [],
      houses: [],
    };
  }

  const kemadrumaExists = assessment.formed;

  if (!kemadrumaExists) {
    // No Kemadruma dosha, so cancellation is not applicable (no dosha to cancel = not a yoga)
    return {
      name: 'Kemadruma Cancellation',
      type: 'benefic',
      present: false,
      strength: 0,
      description: 'No Kemadruma dosha present; cancellation not applicable.',
      planets: [],
      houses: [],
    };
  }

  const present = assessment.cancellations.length > 0;

  let strength = 0;
  if (present) {
    strength = computePlanetStrength('Moon', chartData);
    if (assessment.cancellations.length > 1) strength = Math.min(100, strength + 15);
  }

  const planets: Planet[] = ['Moon', ...assessment.cancellingPlanets];

  return {
    name: 'Kemadruma Cancellation',
    type: 'benefic',
    present,
    strength,
    description: present
      ? `Kemadruma is cancelled: ${assessment.cancellations.join('; ').replace(/ - cancellation applies/g, '')}.`
      : 'Kemadruma is cancelled when the Moon is in an angle from the Lagna or has a planet with it.',
    planets,
    houses: present ? [moonHouse] : [],
    activationPeriod: 'Moon Mahadasha/Antardasha' ?? undefined,
  };
}

function detectParivartana(chartData: ChartData): Yoga[] {
  const yogas: Yoga[] = [];

  for (let h1 = 1; h1 <= 12; h1++) {
    for (let h2 = h1 + 1; h2 <= 12; h2++) {
      const lord1 = getHouseLord(h1, chartData);
      const lord2 = getHouseLord(h2, chartData);
      if (lord1 === lord2) continue; // Same lord rules both houses

      const lord1House = getPlanetHouse(lord1, chartData);
      const lord2House = getPlanetHouse(lord2, chartData);

      // Mutual exchange: lord1 is in lord2's house and lord2 is in lord1's house
      if (lord1House === h2 && lord2House === h1) {
        // Phaladeepika 6.32-33 (register PD-6.32-33, audit YG6): Dainya when the
        // 6th, 8th or 12th lord is one of the two (30 pairs); Khala when the 3rd
        // lord is (8 more); Maha for the remaining 28 pairs among 1, 2, 4, 5, 7,
        // 9, 10 and 11.
        let yogaSubtype: YogaType = 'benefic';
        let description = '';
        const dusthanas = [6, 8, 12];

        if (dusthanas.includes(h1) || dusthanas.includes(h2)) {
          yogaSubtype = 'dosha';
          description = `Dainya Parivartana Yoga: the lords of houses ${h1} and ${h2} exchange places. The Phaladeepika (6.32-33) counts every exchange with the lord of the 6th, 8th or 12th as Dainya and gives it a hard result.`;
        } else if (h1 === 3 || h2 === 3) {
          yogaSubtype = 'benefic';
          description = `Khala Parivartana Yoga: the lords of houses ${h1} and ${h2} exchange places. The Phaladeepika (6.32-33) gives a mixed result: sometimes prosperity, sometimes distress.`;
        } else {
          yogaSubtype = 'raja';
          description = `Maha Parivartana Yoga: the lords of houses ${h1} and ${h2} exchange places. The Phaladeepika (6.32-33) gives wealth, honour from rulers and authority.`;
        }

        const s1 = computePlanetStrength(lord1, chartData);
        const s2 = computePlanetStrength(lord2, chartData);
        const strength = Math.round((s1 + s2) / 2);

        yogas.push({
          name: `Parivartana Yoga (${h1}-${h2})`,
          type: yogaSubtype,
          present: true,
          strength,
          description,
          planets: [lord1, lord2],
          houses: [h1, h2],
          activationPeriod: `${lord1} or ${lord2} Mahadasha/Antardasha` ?? undefined,
        });
      }
    }
  }

  // If no exchanges found, return a single "not present" entry
  if (yogas.length === 0) {
    yogas.push({
      name: 'Parivartana Yoga',
      type: 'benefic',
      present: false,
      strength: 0,
      description:
        'Mutual exchange of signs between two house lords. No Parivartana Yoga detected in this chart.',
      planets: [],
      houses: [],
    });
  }

  return yogas;
}

function detectNipuna(chartData: ChartData): Yoga {
  const conjunct = arePlanetsConjunct('Sun', 'Mercury', chartData);
  const sunHouse = getPlanetHouse('Sun', chartData);
  const inKendra = isInKendra(sunHouse);
  const present = conjunct && inKendra;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength('Sun', chartData);
    const s2 = computePlanetStrength('Mercury', chartData);
    strength = Math.round((s1 + s2) / 2);
  }

  return {
    name: 'Nipuna Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'Mercury and Sun conjunction in a Kendra house. Grants exceptional intelligence, skill in multiple disciplines, and expertise in communication.',
    planets: ['Sun', 'Mercury'],
    houses: present ? [sunHouse] : [],
    activationPeriod: 'Mercury Mahadasha/Antardasha' ?? undefined,
  };
}

// ------ Additional Yogas to reach 50+ ------

function detectChamara(chartData: ChartData): Yoga {
  // Chamara Yoga: Lagna lord exalted in Kendra, aspected by Jupiter
  const lagnaLord = getHouseLord(1, chartData);
  const lagnaLordHouse = getPlanetHouse(lagnaLord, chartData);
  const lagnaLordSign = getPlanetSign(lagnaLord, chartData);

  const exalted = isPlanetExalted(lagnaLord, lagnaLordSign);
  const inKendra = isInKendra(lagnaLordHouse);
  const aspectedByJup = isPlanetAspectedBy(lagnaLord, 'Jupiter', chartData);

  const present = exalted && inKendra && aspectedByJup;

  let strength = 0;
  if (present) {
    strength = computePlanetStrength(lagnaLord, chartData);
  }

  return {
    name: 'Chamara Yoga',
    type: 'raja',
    present,
    strength,
    description:
      'Lagna lord exalted in a Kendra and aspected by Jupiter. Grants learning, royal favor, eloquence, and long life.',
    planets: [lagnaLord, 'Jupiter'],
    houses: present ? [lagnaLordHouse] : [],
    activationPeriod: `${lagnaLord} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectAkhandSamrajya(chartData: ChartData): Yoga {
  // Akhand Samrajya Yoga: Jupiter lords 2nd or 5th or 11th AND is in Kendra,
  // and lord of 2nd, 9th, 11th are strong or in kendra
  const jupHouse = getPlanetHouse('Jupiter', chartData);
  const jupInKendra = isInKendra(jupHouse);

  const lord2 = getHouseLord(2, chartData);
  const lord5 = getHouseLord(5, chartData);
  const lord11 = getHouseLord(11, chartData);
  const lord9 = getHouseLord(9, chartData);

  const jupiterIsLord = lord2 === 'Jupiter' || lord5 === 'Jupiter' || lord11 === 'Jupiter';

  const lord2House = getPlanetHouse(lord2, chartData);
  const lord9House = getPlanetHouse(lord9, chartData);
  const lord11House = getPlanetHouse(lord11, chartData);

  const lord2Strong = isInKendra(lord2House) || isInTrikona(lord2House);
  const lord9Strong = isInKendra(lord9House) || isInTrikona(lord9House);
  const lord11Strong = isInKendra(lord11House) || isInTrikona(lord11House);

  const present = jupInKendra && jupiterIsLord && lord2Strong && lord9Strong && lord11Strong;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength('Jupiter', chartData);
    const s2 = computePlanetStrength(lord9, chartData);
    strength = Math.round((s1 + s2) / 2);
  }

  return {
    name: 'Akhand Samrajya Yoga',
    type: 'raja',
    present,
    strength,
    description:
      'Jupiter lords 2nd, 5th, or 11th house and is in Kendra; lords of 2nd, 9th, 11th are strong. Grants undivided empire, lasting authority, and great wealth.',
    planets: ['Jupiter', lord9],
    houses: present ? [jupHouse] : [],
    activationPeriod: 'Jupiter Mahadasha/Antardasha' ?? undefined,
  };
}

function detectKahala(chartData: ChartData): Yoga {
  // Kahala Yoga: Lord of 4th and 9th houses in mutual Kendras (kendra from each other)
  const lord4 = getHouseLord(4, chartData);
  const lord9 = getHouseLord(9, chartData);
  const lord4House = getPlanetHouse(lord4, chartData);
  const lord9House = getPlanetHouse(lord9, chartData);

  const dist = houseDistance(lord4House, lord9House);
  const inMutualKendra = dist === 1 || dist === 4 || dist === 7 || dist === 10;

  const present = inMutualKendra && lord4 !== lord9;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength(lord4, chartData);
    const s2 = computePlanetStrength(lord9, chartData);
    strength = Math.round((s1 + s2) / 2);
  }

  return {
    name: 'Kahala Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'Lords of 4th and 9th in mutual Kendras. Grants courage, boldness, leadership in community, and land/property.',
    planets: lord4 === lord9 ? [lord4] : [lord4, lord9],
    houses: present ? [lord4House, lord9House] : [],
    activationPeriod: `${lord4} or ${lord9} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectParvata(chartData: ChartData): Yoga {
  // Parvata Yoga: Lords of Lagna and 12th in mutual Kendras AND only benefics in Kendras (no malefics)
  const lord1 = getHouseLord(1, chartData);
  const lord12 = getHouseLord(12, chartData);
  const lord1House = getPlanetHouse(lord1, chartData);
  const lord12House = getPlanetHouse(lord12, chartData);

  const dist = houseDistance(lord1House, lord12House);
  const mutualKendra = dist === 1 || dist === 4 || dist === 7 || dist === 10;

  // Check kendras have no malefics
  const kendras = [1, 4, 7, 10];
  let maleficInKendra = false;
  for (const k of kendras) {
    for (const mal of NATURAL_MALEFICS) {
      if (getPlanetHouse(mal, chartData) === k) {
        maleficInKendra = true;
        break;
      }
    }
    if (maleficInKendra) break;
  }

  // Simpler condition: benefics in kendra and lords 1/12 in mutual kendras
  const present = mutualKendra && !maleficInKendra;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength(lord1, chartData);
    const s2 = computePlanetStrength(lord12, chartData);
    strength = Math.round((s1 + s2) / 2);
  }

  return {
    name: 'Parvata Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'Lords of 1st and 12th in mutual Kendras with no malefics in Kendra houses. Grants fame, government favor, and mountain-like stability.',
    planets: lord1 === lord12 ? [lord1] : [lord1, lord12],
    houses: present ? [lord1House, lord12House] : [],
    activationPeriod: `${lord1} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectShankha(chartData: ChartData): Yoga {
  // Shankha Yoga: Lords of 5th and 6th in mutual Kendras, Lagna lord strong
  const lord5 = getHouseLord(5, chartData);
  const lord6 = getHouseLord(6, chartData);
  const lord5House = getPlanetHouse(lord5, chartData);
  const lord6House = getPlanetHouse(lord6, chartData);

  const dist = houseDistance(lord5House, lord6House);
  const mutualKendra = dist === 1 || dist === 4 || dist === 7 || dist === 10;

  const lord1 = getHouseLord(1, chartData);
  const lord1Str = computePlanetStrength(lord1, chartData);
  const lord1Strong = lord1Str >= 50;

  const present = mutualKendra && lord1Strong && lord5 !== lord6;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength(lord5, chartData);
    const s2 = computePlanetStrength(lord6, chartData);
    strength = Math.round((s1 + s2 + lord1Str) / 3);
  }

  return {
    name: 'Shankha Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'Lords of 5th and 6th in mutual Kendras with strong Lagna lord. Grants love of life, good morals, longevity, and a comfortable existence.',
    planets: lord5 === lord6 ? [lord5, lord1] : [lord5, lord6, lord1],
    houses: present ? [lord5House, lord6House] : [],
    activationPeriod: `${lord5} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectKhadrga(chartData: ChartData): Yoga {
  // Khadga Yoga: 9th lord in 2nd house, Lagna lord in kendra with 2nd lord
  const lord9 = getHouseLord(9, chartData);
  const lord9House = getPlanetHouse(lord9, chartData);
  const lord1 = getHouseLord(1, chartData);
  const lord1House = getPlanetHouse(lord1, chartData);
  const lord2 = getHouseLord(2, chartData);
  const lord2House = getPlanetHouse(lord2, chartData);

  const lord9In2nd = lord9House === 2;
  const lord1InKendra = isInKendra(lord1House);
  const lord1ConjLord2 = arePlanetsConjunct(lord1, lord2, chartData);

  const present = lord9In2nd && lord1InKendra && lord1ConjLord2;

  let strength = 0;
  if (present) {
    strength = Math.round(
      (computePlanetStrength(lord9, chartData) +
        computePlanetStrength(lord1, chartData) +
        computePlanetStrength(lord2, chartData)) /
        3,
    );
  }

  return {
    name: 'Khadga Yoga',
    type: 'dhana',
    present,
    strength,
    description:
      '9th lord in 2nd house with Lagna lord and 2nd lord conjunct in Kendra. Grants wealth, intelligence, and a comfortable life.',
    planets: [...new Set([lord9, lord1, lord2])],
    houses: present ? [2, lord1House] : [],
    activationPeriod: `${lord9} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectKedarNath(chartData: ChartData): Yoga {
  // Kedara Yoga: All seven planets in four houses (Bṛhat Jātaka 12.10,
  // register BJ-12.10). The verse ends "anyān pūrvam uktān vihāya": a chart
  // that is already one of the figures named before it is that figure and
  // not Kedara. With four houses those are the four angles (Vajra, Yava,
  // Kamala), the four succedent or the four cadent houses (Vāpī, 12.5), and
  // four houses in a row from an angle (Yūpa, Iṣu, Śakti, Daṇḍa, 12.7).
  const housesOccupied = new Set<number>();
  for (const p of SEVEN_PLANETS) {
    const h = getPlanetHouse(p, chartData);
    if (h > 0) housesOccupied.add(h);
  }
  const isExactly = (houses: number[]) => houses.every((h) => housesOccupied.has(h));
  const earlierFigure =
    housesOccupied.size === 4 &&
    (isExactly([1, 4, 7, 10]) ||
      isExactly([2, 5, 8, 11]) ||
      isExactly([3, 6, 9, 12]) ||
      [1, 4, 7, 10].some((start) =>
        isExactly([0, 1, 2, 3].map((step) => ((start - 1 + step) % 12) + 1)),
      ));
  const present = housesOccupied.size === 4 && !earlierFigure;

  let strength = 0;
  if (present) {
    const avgStr =
      SEVEN_PLANETS.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / 7;
    strength = Math.round(avgStr);
  }

  return {
    name: 'Kedara Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'All seven planets occupy exactly four houses. Grants agricultural wealth, land ownership, and a helpful, charitable nature.',
    planets: SEVEN_PLANETS,
    houses: present ? [...housesOccupied] : [],
  };
}

function detectMusala(chartData: ChartData): Yoga {
  // Musala Yoga: All planets in fixed signs (Taurus, Leo, Scorpio, Aquarius)
  const fixedSigns: ZodiacSign[] = ['Taurus', 'Leo', 'Scorpio', 'Aquarius'];
  const allInFixed = SEVEN_PLANETS.every((p) => fixedSigns.includes(getPlanetSign(p, chartData)));

  let strength = 0;
  if (allInFixed) {
    const avgStr =
      SEVEN_PLANETS.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / 7;
    strength = Math.round(avgStr);
  }

  return {
    name: 'Musala Yoga',
    type: 'benefic',
    present: allInFixed,
    strength,
    description:
      'All planets in fixed signs (Taurus, Leo, Scorpio, Aquarius). Grants wealth, fame, steadfastness, and a proud nature.',
    planets: SEVEN_PLANETS,
    houses: allInFixed ? SEVEN_PLANETS.map((p) => getPlanetHouse(p, chartData)) : [],
  };
}

// Bṛhat Jātaka 12.2 (register BJ-12.2): "rajjur muśalaṃ nalaś cara-ādyaiḥ" —
// Rajju, Musala and Nala by the movable, fixed and dual signs, in that order.
// The results are from 12.11. (Nala and Rajju were the other way round here.)

function detectNala(chartData: ChartData): Yoga {
  // Nala Yoga: All planets in dual signs (Gemini, Virgo, Sagittarius, Pisces)
  const dualSigns: ZodiacSign[] = ['Gemini', 'Virgo', 'Sagittarius', 'Pisces'];
  const allInDual = SEVEN_PLANETS.every((p) => dualSigns.includes(getPlanetSign(p, chartData)));

  let strength = 0;
  if (allInDual) {
    const avgStr =
      SEVEN_PLANETS.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / 7;
    strength = Math.round(avgStr);
  }

  return {
    name: 'Nala Yoga',
    type: 'benefic',
    present: allInDual,
    strength,
    description:
      'All planets in dual signs (Gemini, Virgo, Sagittarius, Pisces). Grants a steady mind, means, and skill in work.',
    planets: SEVEN_PLANETS,
    houses: allInDual ? SEVEN_PLANETS.map((p) => getPlanetHouse(p, chartData)) : [],
  };
}

function detectRajju(chartData: ChartData): Yoga {
  // Rajju Yoga: All planets in movable signs (Aries, Cancer, Libra, Capricorn)
  const movableSigns: ZodiacSign[] = ['Aries', 'Cancer', 'Libra', 'Capricorn'];
  const allInMovable = SEVEN_PLANETS.every((p) =>
    movableSigns.includes(getPlanetSign(p, chartData)),
  );

  let strength = 0;
  if (allInMovable) {
    const avgStr =
      SEVEN_PLANETS.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / 7;
    strength = Math.round(avgStr);
  }

  return {
    name: 'Rajju Yoga',
    type: 'benefic',
    present: allInMovable,
    strength,
    description:
      'All planets in movable signs (Aries, Cancer, Libra, Capricorn). Grants love of travel and fondness for foreign lands, with an eye on what others have.',
    planets: SEVEN_PLANETS,
    houses: allInMovable ? SEVEN_PLANETS.map((p) => getPlanetHouse(p, chartData)) : [],
  };
}

function detectSunapha2ndLord(chartData: ChartData): Yoga {
  // Dhana Yoga variant: 2nd lord and 11th lord in kendra from each other
  const lord2 = getHouseLord(2, chartData);
  const lord11 = getHouseLord(11, chartData);
  const lord2House = getPlanetHouse(lord2, chartData);
  const lord11House = getPlanetHouse(lord11, chartData);

  const dist = houseDistance(lord2House, lord11House);
  const mutualKendra = dist === 1 || dist === 4 || dist === 7 || dist === 10;
  const present = mutualKendra && lord2 !== lord11;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength(lord2, chartData);
    const s2 = computePlanetStrength(lord11, chartData);
    strength = Math.round((s1 + s2) / 2);
  }

  return {
    name: 'Dhana Yoga (2-11 Lords)',
    type: 'dhana',
    present,
    strength,
    description:
      'Lords of 2nd and 11th houses in mutual Kendras. Indicates financial prosperity and multiple income sources.',
    planets: lord2 === lord11 ? [lord2] : [lord2, lord11],
    houses: present ? [lord2House, lord11House] : [],
    activationPeriod: `${lord2} or ${lord11} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectChandraMangalDhana(chartData: ChartData): Yoga {
  // 1st and 2nd lord conjunction or exchange
  const lord1 = getHouseLord(1, chartData);
  const lord2 = getHouseLord(2, chartData);
  const conjunct = arePlanetsConjunct(lord1, lord2, chartData);

  const lord1Sign = getPlanetSign(lord1, chartData);
  const lord2Sign = getPlanetSign(lord2, chartData);
  const exchange =
    lord1 !== lord2 && SIGN_LORDS[lord1Sign] === lord2 && SIGN_LORDS[lord2Sign] === lord1;

  const present = (conjunct || exchange) && lord1 !== lord2;
  const lord1House = getPlanetHouse(lord1, chartData);

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength(lord1, chartData);
    const s2 = computePlanetStrength(lord2, chartData);
    strength = Math.round((s1 + s2) / 2);
  }

  return {
    name: 'Dhana Yoga (1-2 Lords)',
    type: 'dhana',
    present,
    strength,
    description:
      'Lords of 1st and 2nd houses conjunct or in mutual exchange. Grants wealth through personal effort and family resources.',
    planets: lord1 === lord2 ? [lord1] : [lord1, lord2],
    houses: present ? [lord1House] : [],
    activationPeriod: `${lord1} or ${lord2} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectGauri(chartData: ChartData): Yoga {
  // Gauri Yoga: Moon in own/exalted sign in kendra/trikona, aspected by Jupiter
  const moonHouse = getPlanetHouse('Moon', chartData);
  const moonSign = getPlanetSign('Moon', chartData);
  const moonStrong = isPlanetExalted('Moon', moonSign) || isPlanetInOwnSign('Moon', moonSign);
  const inKT = isInKendraOrTrikona(moonHouse);
  const aspByJup = isPlanetAspectedBy('Moon', 'Jupiter', chartData);

  const present = moonStrong && inKT && aspByJup;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength('Moon', chartData);
    const s2 = computePlanetStrength('Jupiter', chartData);
    strength = Math.round((s1 + s2) / 2);
  }

  return {
    name: 'Gauri Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'Moon in own/exalted sign in Kendra/Trikona aspected by Jupiter. Grants beauty, virtuous spouse, and domestic happiness.',
    planets: ['Moon', 'Jupiter'],
    houses: present ? [moonHouse] : [],
    activationPeriod: 'Moon Mahadasha/Antardasha' ?? undefined,
  };
}

function detectBheri(chartData: ChartData): Yoga {
  // Bheri Yoga: Venus, Jupiter, Lagna lord in mutual Kendras; 9th lord strong
  const lord1 = getHouseLord(1, chartData);
  const lord9 = getHouseLord(9, chartData);

  const venHouse = getPlanetHouse('Venus', chartData);
  const jupHouse = getPlanetHouse('Jupiter', chartData);
  const lord1House = getPlanetHouse(lord1, chartData);

  const venJupKendra = (() => {
    const d = houseDistance(venHouse, jupHouse);
    return d === 1 || d === 4 || d === 7 || d === 10;
  })();
  const jupLord1Kendra = (() => {
    const d = houseDistance(jupHouse, lord1House);
    return d === 1 || d === 4 || d === 7 || d === 10;
  })();

  const lord9Str = computePlanetStrength(lord9, chartData);
  const present = venJupKendra && jupLord1Kendra && lord9Str >= 50;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength('Venus', chartData);
    const s2 = computePlanetStrength('Jupiter', chartData);
    strength = Math.round((s1 + s2 + lord9Str) / 3);
  }

  const planets: Planet[] = [...new Set<Planet>(['Venus', 'Jupiter', lord1, lord9])];

  return {
    name: 'Bheri Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'Venus, Jupiter, and Lagna lord in mutual Kendras with strong 9th lord. Grants piety, wealth, happiness, and a long life.',
    planets,
    houses: present ? [venHouse, jupHouse, lord1House] : [],
    activationPeriod: 'Venus or Jupiter Mahadasha/Antardasha' ?? undefined,
  };
}

function detectKendradhipatiDosha(chartData: ChartData): Yoga {
  // Kendradhipati Dosha: Natural benefic lords a kendra (loses beneficence)
  const kendras = [1, 4, 7, 10];
  const found: Planet[] = [];
  const housesFound: number[] = [];

  for (const k of kendras) {
    const lord = getHouseLord(k, chartData);
    if (natureOf(lord, chartData) === 'benefic' && lord !== 'Moon') {
      // Moon is exempt in many traditions
      found.push(lord);
      housesFound.push(k);
    }
  }

  const uniquePlanets = [...new Set(found)];
  const present = uniquePlanets.length > 0;

  let strength = 0;
  if (present) {
    // Strength here means severity of the dosha
    strength = Math.round(
      uniquePlanets.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) /
        uniquePlanets.length,
    );
    // Weaker benefic in kendra = stronger dosha effect
    strength = Math.max(10, 100 - strength);
  }

  return {
    name: 'Kendradhipati Dosha',
    type: 'dosha',
    present,
    strength,
    description:
      'Natural benefic planets owning Kendra houses lose their beneficence. Indicates reduced positive results from those benefics unless they also lord a trikona.',
    planets: uniquePlanets,
    houses: [...new Set(housesFound)],
  };
}

function detectShadashtak(chartData: ChartData): Yoga {
  // Sun-Saturn opposition or 6-8 relationship
  const sunHouse = getPlanetHouse('Sun', chartData);
  const satHouse = getPlanetHouse('Saturn', chartData);
  const dist = houseDistance(sunHouse, satHouse);
  const present = dist === 6 || dist === 8;

  let strength = 0;
  if (present) {
    strength = 50; // Moderate difficulty yoga
    // Stronger if both are weak
    const sunStr = computePlanetStrength('Sun', chartData);
    const satStr = computePlanetStrength('Saturn', chartData);
    if (sunStr < 40 && satStr < 40) strength = 70;
  }

  return {
    name: 'Sun-Saturn Shadashtak',
    type: 'dosha',
    present,
    strength,
    description:
      'Sun and Saturn in 6-8 relationship (Shadashtak). Indicates tension between authority and discipline, possible conflicts with father/government.',
    planets: ['Sun', 'Saturn'],
    houses: present ? [sunHouse, satHouse] : [],
  };
}

function detectAngarak(chartData: ChartData): Yoga {
  // Angarak Yoga: Mars conjunct Rahu
  const conjunct = arePlanetsConjunct('Mars', 'Rahu', chartData);
  const marsHouse = getPlanetHouse('Mars', chartData);

  let strength = 0;
  if (conjunct) {
    strength = 60;
    const marsStr = computePlanetStrength('Mars', chartData);
    if (marsStr < 40) strength = 75;
  }

  return {
    name: 'Angarak Yoga',
    type: 'dosha',
    present: conjunct,
    strength,
    description:
      'Mars conjunct Rahu. Indicates aggression, accidents, conflicts, and legal troubles. Can also give technical/surgical skills if well-placed.',
    planets: ['Mars', 'Rahu'],
    houses: conjunct ? [marsHouse] : [],
    activationPeriod: 'Mars or Rahu Mahadasha/Antardasha' ?? undefined,
  };
}

function detectGuruChandal(chartData: ChartData): Yoga {
  // Guru Chandal Yoga: Jupiter conjunct Rahu or Ketu
  const conjRahu = arePlanetsConjunct('Jupiter', 'Rahu', chartData);
  const conjKetu = arePlanetsConjunct('Jupiter', 'Ketu', chartData);
  const present = conjRahu || conjKetu;
  const jupHouse = getPlanetHouse('Jupiter', chartData);
  const shadowPlanet: Planet = conjRahu ? 'Rahu' : 'Ketu';

  let strength = 0;
  if (present) {
    strength = 55;
    const jupStr = computePlanetStrength('Jupiter', chartData);
    if (jupStr < 40) strength = 70;
  }

  return {
    name: 'Guru Chandal Yoga',
    type: 'dosha',
    present,
    strength,
    description:
      "Jupiter conjunct Rahu or Ketu. Corrupts Jupiter's wisdom, causing unorthodox beliefs, broken promises, and challenges with gurus/teachers. Can give unconventional success.",
    planets: ['Jupiter', shadowPlanet],
    houses: present ? [jupHouse] : [],
    activationPeriod: `Jupiter or ${shadowPlanet} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectGrahan(chartData: ChartData): Yoga {
  // Grahan Yoga: Sun conjunct Rahu/Ketu (solar eclipse) or Moon conjunct Rahu/Ketu (lunar eclipse)
  const sunConjRahu = arePlanetsConjunct('Sun', 'Rahu', chartData);
  const sunConjKetu = arePlanetsConjunct('Sun', 'Ketu', chartData);
  const moonConjRahu = arePlanetsConjunct('Moon', 'Rahu', chartData);
  const moonConjKetu = arePlanetsConjunct('Moon', 'Ketu', chartData);

  const solarGrahan = sunConjRahu || sunConjKetu;
  const lunarGrahan = moonConjRahu || moonConjKetu;
  const present = solarGrahan || lunarGrahan;

  const planets: Planet[] = [];
  const houses: number[] = [];
  if (solarGrahan) {
    planets.push('Sun', sunConjRahu ? 'Rahu' : 'Ketu');
    houses.push(getPlanetHouse('Sun', chartData));
  }
  if (lunarGrahan) {
    planets.push('Moon', moonConjRahu ? 'Rahu' : 'Ketu');
    houses.push(getPlanetHouse('Moon', chartData));
  }

  let strength = 0;
  if (present) {
    strength = 55;
    if (solarGrahan && lunarGrahan) strength = 75;
  }

  return {
    name: 'Grahan Yoga',
    type: 'dosha',
    present,
    strength,
    description: present
      ? `${solarGrahan ? 'Solar' : ''}${solarGrahan && lunarGrahan ? ' and ' : ''}${lunarGrahan ? 'Lunar' : ''} eclipse yoga. Luminaries conjunct shadow planets; challenges to health, confidence, and mental peace.`
      : 'Grahan Yoga: Luminaries conjunct Rahu/Ketu. Not present in this chart.',
    planets: [...new Set(planets)],
    houses: [...new Set(houses)],
  };
}

function detectShakat(chartData: ChartData): Yoga {
  // Shakata Yoga: Moon in 6th, 8th, or 12th from Jupiter
  const moonHouse = getPlanetHouse('Moon', chartData);
  const jupHouse = getPlanetHouse('Jupiter', chartData);
  if (moonHouse === 0 || jupHouse === 0) {
    return {
      name: 'Shakata Yoga',
      type: 'dosha',
      present: false,
      strength: 0,
      description: 'Moon in 6, 8, or 12 from Jupiter.',
      planets: [],
      houses: [],
    };
  }

  // Phaladeepika 6.14: "if the Moon be in a Kendra house from the Lagna, there is
  // no Shakata" (register PD-6.14).
  const dist = houseDistance(jupHouse, moonHouse);
  const present = (dist === 6 || dist === 8 || dist === 12) && !isInKendra(moonHouse);

  let strength = 0;
  if (present) {
    strength = 45;
    const moonStr = computePlanetStrength('Moon', chartData);
    if (moonStr < 40) strength = 65;
  }

  return {
    name: 'Shakata Yoga',
    type: 'dosha',
    present,
    strength,
    description:
      'Moon in the 6th, 8th or 12th from Jupiter, unless the Moon is in a Kendra from the Lagna (Phaladeepika 6.14). A later tradition reads it as fluctuating fortune.',
    planets: ['Moon', 'Jupiter'],
    houses: present ? [moonHouse, jupHouse] : [],
  };
}

function detectDaridra(chartData: ChartData): Yoga {
  // Daridra Yoga: Lord of 11th in 6th, 8th, or 12th house
  const lord11 = getHouseLord(11, chartData);
  const lord11House = getPlanetHouse(lord11, chartData);
  const dusthanas = [6, 8, 12];
  const present = dusthanas.includes(lord11House);

  let strength = 0;
  if (present) {
    strength = 50;
    const lord11Str = computePlanetStrength(lord11, chartData);
    if (lord11Str < 30) strength = 70;
  }

  return {
    name: 'Daridra Yoga',
    type: 'dosha',
    present,
    strength,
    description:
      '11th lord in a dusthana house (6, 8, or 12). Indicates financial difficulties, blocked income, and challenges in fulfilling desires.',
    planets: [lord11],
    houses: present ? [lord11House] : [],
    activationPeriod: `${lord11} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectRajaLakshmana(chartData: ChartData): Yoga {
  // Raja Yoga: Lord of kendra conjunct lord of trikona (generic form)
  const kendraHouses = [1, 4, 7, 10];
  const trikonaHouses = [5, 9]; // Exclude 1 to avoid self-pairing
  const yogas: Yoga[] = [];
  const checked = new Set<string>();

  for (const kh of kendraHouses) {
    for (const th of trikonaHouses) {
      const kendraLord = getHouseLord(kh, chartData);
      const trikonaLord = getHouseLord(th, chartData);
      if (kendraLord === trikonaLord) continue;

      const key = [kendraLord, trikonaLord].sort().join('-') + `_${kh}_${th}`;
      if (checked.has(key)) continue;
      checked.add(key);

      const conjunct = arePlanetsConjunct(kendraLord, trikonaLord, chartData);
      const kHouse = getPlanetHouse(kendraLord, chartData);
      const tHouse = getPlanetHouse(trikonaLord, chartData);
      const mutualAspect =
        doesPlanetAspect(kendraLord, tHouse, chartData) &&
        doesPlanetAspect(trikonaLord, kHouse, chartData);

      if (conjunct || mutualAspect) {
        const s1 = computePlanetStrength(kendraLord, chartData);
        const s2 = computePlanetStrength(trikonaLord, chartData);
        const strength = Math.round((s1 + s2) / 2);

        yogas.push({
          name: `Raja Yoga (${kh}-${th} Lords)`,
          type: 'raja',
          present: true,
          strength,
          description: `Lords of houses ${kh} (Kendra) and ${th} (Trikona) are ${conjunct ? 'conjunct' : 'in mutual aspect'}. A classic Raja Yoga granting power, position, and authority.`,
          planets: [kendraLord, trikonaLord],
          houses: [kHouse, tHouse],
          activationPeriod: `${kendraLord} or ${trikonaLord} Mahadasha/Antardasha` ?? undefined,
        });
      }
    }
  }

  return yogas.length > 0
    ? yogas[0]
    : {
        name: 'Raja Yoga (Kendra-Trikona)',
        type: 'raja',
        present: false,
        strength: 0,
        description:
          'Kendra lord conjunct or in mutual aspect with Trikona lord. Not found in this chart.',
        planets: [],
        houses: [],
      };
}

function detectAllRajaYogas(chartData: ChartData): Yoga[] {
  const kendraHouses = [1, 4, 7, 10];
  const trikonaHouses = [5, 9];
  const yogas: Yoga[] = [];
  const checked = new Set<string>();

  for (const kh of kendraHouses) {
    for (const th of trikonaHouses) {
      const kendraLord = getHouseLord(kh, chartData);
      const trikonaLord = getHouseLord(th, chartData);
      if (kendraLord === trikonaLord) continue;

      const pairKey = [kendraLord, trikonaLord].sort().join('-');
      if (checked.has(pairKey)) continue;
      checked.add(pairKey);

      const conjunct = arePlanetsConjunct(kendraLord, trikonaLord, chartData);
      const kHouse = getPlanetHouse(kendraLord, chartData);
      const tHouse = getPlanetHouse(trikonaLord, chartData);
      const mutualAspect =
        doesPlanetAspect(kendraLord, tHouse, chartData) &&
        doesPlanetAspect(trikonaLord, kHouse, chartData);

      if (conjunct || mutualAspect) {
        const s1 = computePlanetStrength(kendraLord, chartData);
        const s2 = computePlanetStrength(trikonaLord, chartData);
        const strength = Math.round((s1 + s2) / 2);

        yogas.push({
          name: `Raja Yoga (${kh}-${th} Lords)`,
          type: 'raja',
          present: true,
          strength,
          description: `Lords of houses ${kh} (Kendra) and ${th} (Trikona) are ${conjunct ? 'conjunct' : 'in mutual aspect'}. A classic Raja Yoga granting power, position, and authority.`,
          planets: [kendraLord, trikonaLord],
          houses: [kHouse, tHouse],
          activationPeriod: `${kendraLord} or ${trikonaLord} Mahadasha/Antardasha` ?? undefined,
        });
      }
    }
  }

  return yogas;
}

function detectChaturSagara(chartData: ChartData): Yoga {
  // Chatur Sagara Yoga: All Kendras (1,4,7,10) occupied by planets
  const kendras = [1, 4, 7, 10];
  const allOccupied = kendras.every((k) => chartData.planets.some((p) => p.house === k));

  const planetsInKendras: Planet[] = [];
  for (const k of kendras) {
    for (const pp of chartData.planets) {
      if (pp.house === k && !planetsInKendras.includes(pp.planet)) {
        planetsInKendras.push(pp.planet);
      }
    }
  }

  let strength = 0;
  if (allOccupied) {
    strength = Math.round(
      planetsInKendras.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) /
        planetsInKendras.length,
    );
  }

  return {
    name: 'Chatur Sagara Yoga',
    type: 'benefic',
    present: allOccupied,
    strength,
    description:
      'All four Kendra houses (1, 4, 7, 10) are occupied by planets. Grants fame, dominion, long life, and respect from many people.',
    planets: planetsInKendras,
    houses: allOccupied ? kendras : [],
  };
}

function detectVasuki(chartData: ChartData): Yoga {
  // Vasuki Yoga: Benefics in 3rd house from Lagna
  const found: Planet[] = [];
  for (const b of beneficsOf(chartData)) {
    if (getPlanetHouse(b, chartData) === 3) found.push(b);
  }

  const present = found.length >= 2;
  let strength = 0;
  if (present) {
    strength = Math.round(
      found.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / found.length,
    );
  }

  return {
    name: 'Vasuki Yoga',
    type: 'benefic',
    present,
    strength,
    description:
      'Two or more benefics in the 3rd house. Grants courage, artistic skills, and success through self-effort and siblings.',
    planets: found,
    houses: present ? [3] : [],
  };
}

function detectMahaLakshmi(chartData: ChartData): Yoga {
  // Maha Lakshmi Yoga: Lord of 5th and 9th in Kendra, strong and unafflicted
  const lord5 = getHouseLord(5, chartData);
  const lord9 = getHouseLord(9, chartData);
  const lord5House = getPlanetHouse(lord5, chartData);
  const lord9House = getPlanetHouse(lord9, chartData);

  const lord5InKendra = isInKendra(lord5House);
  const lord9InKendra = isInKendra(lord9House);
  const lord5Str = computePlanetStrength(lord5, chartData);
  const lord9Str = computePlanetStrength(lord9, chartData);

  const present = lord5InKendra && lord9InKendra && lord5Str >= 50 && lord9Str >= 50;

  let strength = 0;
  if (present) {
    strength = Math.round((lord5Str + lord9Str) / 2);
  }

  const planets: Planet[] = lord5 === lord9 ? [lord5] : [lord5, lord9];

  return {
    name: 'Maha Lakshmi Yoga',
    type: 'dhana',
    present,
    strength,
    description:
      'Lords of 5th and 9th in Kendra houses with good strength. Bestows great wealth, fortune, and divine grace.',
    planets,
    houses: present ? [lord5House, lord9House] : [],
    activationPeriod: `${lord5} or ${lord9} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectSreenath(chartData: ChartData): Yoga {
  // Sreenatha Yoga: 7th lord in 10th and 10th lord in 7th (mutual exchange between 7 and 10)
  const lord7 = getHouseLord(7, chartData);
  const lord10 = getHouseLord(10, chartData);
  const lord7House = getPlanetHouse(lord7, chartData);
  const lord10House = getPlanetHouse(lord10, chartData);

  const present = lord7House === 10 && lord10House === 7 && lord7 !== lord10;

  let strength = 0;
  if (present) {
    const s1 = computePlanetStrength(lord7, chartData);
    const s2 = computePlanetStrength(lord10, chartData);
    strength = Math.round((s1 + s2) / 2);
  }

  return {
    name: 'Sreenatha Yoga',
    type: 'raja',
    present,
    strength,
    description:
      '7th lord in 10th and 10th lord in 7th (mutual exchange). Grants high status through partnerships, marriage, or business associations.',
    planets: lord7 === lord10 ? [lord7] : [lord7, lord10],
    houses: present ? [7, 10] : [],
    activationPeriod: `${lord7} or ${lord10} Mahadasha/Antardasha` ?? undefined,
  };
}

function detectAdhiYogaFromLagna(chartData: ChartData): Yoga {
  // Adhi Yoga from Lagna: Benefics in 6, 7, 8 from Lagna
  const offsets = [6, 7, 8];
  const found: Planet[] = [];
  const housesFound: number[] = [];

  const benefics = beneficsOf(chartData);
  for (const b of benefics) {
    const bHouse = getPlanetHouse(b, chartData);
    if (offsets.includes(bHouse)) {
      found.push(b);
      if (!housesFound.includes(bHouse)) housesFound.push(bHouse);
    }
  }

  const positionsCovered = offsets.filter((h) =>
    benefics.some((b) => getPlanetHouse(b, chartData) === h),
  ).length;

  const present = positionsCovered >= 2;

  let strength = 0;
  if (present) {
    strength = Math.round(
      found.reduce((sum, p) => sum + computePlanetStrength(p, chartData), 0) / found.length,
    );
    if (positionsCovered === 3) strength = Math.min(100, strength + 10);
  }

  return {
    name: 'Adhi Yoga (from Lagna)',
    type: 'benefic',
    present,
    strength,
    description:
      'Natural benefics in 6th, 7th, 8th from Lagna. Grants ministerial position, leadership, and authority.',
    planets: found,
    houses: housesFound,
    activationPeriod:
      found.length > 0 ? `${found[0]} Mahadasha/Antardasha` : (undefined ?? undefined),
  };
}

// ============================================================
// Master Detection Function
// ============================================================

/**
 * Detect all yogas (planetary combinations) in the given chart.
 * Returns an array of 50+ yoga results, each with presence, strength, and details.
 * All calculations are purely deterministic math based on planet positions and house data.
 */
export function detectAllYogas(chartData: ChartData): Yoga[] {
  const yogas: Yoga[] = [];

  // ---- Pancha Mahapurusha (5) ----
  yogas.push(detectRuchaka(chartData));
  yogas.push(detectBhadra(chartData));
  yogas.push(detectHamsa(chartData));
  yogas.push(detectMalavya(chartData));
  yogas.push(detectShasha(chartData));

  // ---- Raja Yogas (4 named + generic Kendra-Trikona) ----
  yogas.push(detectDharmaKarmadhipati(chartData));
  yogas.push(detectViparitaRaja(chartData));
  yogas.push(detectNeechBhangaRaja(chartData));
  yogas.push(detectMahaBhagya(chartData));

  // Generic Kendra-Trikona Raja Yogas (can produce multiple)
  const genericRajaYogas = detectAllRajaYogas(chartData);
  if (genericRajaYogas.length > 0) {
    yogas.push(...genericRajaYogas);
  } else {
    yogas.push({
      name: 'Raja Yoga (Kendra-Trikona)',
      type: 'raja',
      present: false,
      strength: 0,
      description:
        'Kendra lord conjunct or in mutual aspect with Trikona lord. Not found in this chart.',
      planets: [],
      houses: [],
    });
  }

  // ---- Dhana Yogas (3 + 3 additional) ----
  yogas.push(detectLakshmi(chartData));
  yogas.push(detectVasumathi(chartData));
  yogas.push(detectKalanidhi(chartData));
  yogas.push(detectSunapha2ndLord(chartData));
  yogas.push(detectChandraMangalDhana(chartData));
  yogas.push(detectMahaLakshmi(chartData));
  yogas.push(detectKhadrga(chartData));

  // ---- Lunar Yogas (6) ----
  yogas.push(detectGajakesari(chartData));
  yogas.push(detectSunapha(chartData));
  yogas.push(detectAnapha(chartData));
  yogas.push(detectDurudhara(chartData));
  yogas.push(detectChandraMangal(chartData));
  yogas.push(detectAdhi(chartData));

  // ---- Solar Yogas (4) ----
  yogas.push(detectBudhaditya(chartData));
  yogas.push(detectVeshi(chartData));
  yogas.push(detectVoshi(chartData));
  yogas.push(detectUbhayachari(chartData));

  // ---- Other Named Yogas ----
  yogas.push(detectSaraswati(chartData));
  yogas.push(detectAmala(chartData));
  yogas.push(detectGuruMangala(chartData));
  yogas.push(detectHarsha(chartData));
  yogas.push(detectSarala(chartData));
  yogas.push(detectVimala(chartData));
  yogas.push(detectKemadrumaCanellation(chartData));
  yogas.push(detectNipuna(chartData));
  yogas.push(detectGauri(chartData));
  yogas.push(detectBheri(chartData));

  // ---- Parivartana Yogas (can produce multiple) ----
  yogas.push(...detectParivartana(chartData));

  // ---- Additional structural yogas ----
  yogas.push(detectChamara(chartData));
  yogas.push(detectAkhandSamrajya(chartData));
  yogas.push(detectKahala(chartData));
  yogas.push(detectParvata(chartData));
  yogas.push(detectShankha(chartData));
  yogas.push(detectChaturSagara(chartData));
  yogas.push(detectVasuki(chartData));
  yogas.push(detectSreenath(chartData));
  yogas.push(detectAdhiYogaFromLagna(chartData));

  // ---- Sign-based yogas ----
  yogas.push(detectKedarNath(chartData));
  yogas.push(detectMusala(chartData));
  yogas.push(detectNala(chartData));
  yogas.push(detectRajju(chartData));

  // ---- Dosha-type yogas ----
  yogas.push(detectKendradhipatiDosha(chartData));
  yogas.push(detectShadashtak(chartData));
  yogas.push(detectAngarak(chartData));
  yogas.push(detectGuruChandal(chartData));
  yogas.push(detectGrahan(chartData));
  yogas.push(detectShakat(chartData));
  yogas.push(detectDaridra(chartData));

  return yogas;
}
