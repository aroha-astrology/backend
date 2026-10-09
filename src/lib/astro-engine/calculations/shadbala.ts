// =============================================================================
// Shadbala (six-fold strength), after Bṛhat Parāśara Horā Śāstra chapter 27
// =============================================================================
// Every formula here is one the chapter gives, worked in the chapter's own
// units (virupas; 60 virupas = 1 rupa). The passages, with the Sanskrit and the
// translation they were read from, are in docs/engine-audit/D-source-register.md
// as BPHS-27.x. The tests in test/audit/shadbala.audit.spec.ts work each term
// by hand from the chapter's examples.
//
//   Sthana  position:   Uchcha, Saptavargaja, Ojhayugma, Kendradi, Drekkana
//   Dig     direction:  distance from the point of full strength, in degrees
//   Kala    time:       Nathonnata, Paksha, Tribhaga, Varsha/Masa/Dina/Hora, Ayana
//   Cheshta motion:     the Sun's Ayana, the Moon's Paksha, the rest by kendra
//   Naisargika natural: a fixed share of 60 for each planet
//   Drik    aspect:     a quarter of the aspects received, benefic minus malefic
//
// NOT implemented, and left out of the totals: Yuddha Bala (planetary war) and
// the Bhava Bala of the twelve houses. Where the Sanskrit and the translator's
// notes differ, or the text does not decide, the choice is a field of the rule
// profile (rules/profile.ts).
// =============================================================================

import type {
  ChartData,
  Planet,
  PlanetPosition,
  PlanetShadbala,
  ZodiacSign,
} from '@aroha-astrology/shared';
import {
  PLANET_DEBILITATION,
  PLANET_OWN_SIGNS,
  SIGN_LORDS,
  ZODIAC_SIGNS,
} from '@aroha-astrology/shared';

import {
  calculateD2,
  calculateD3,
  calculateD7,
  calculateD9,
  calculateD12,
  calculateD30,
} from '../charts/divisionalCharts.js';
import { masaLordIndex, varshaLordIndex } from '../rules/ahargana.js';
import { estimateDayContext, type DayContext } from '../rules/day.js';
import { naturalRelation } from '../rules/dignity.js';
import { natureOf } from '../rules/nature.js';
import { getActiveProfile } from '../rules/profile.js';
import { meanSiderealLongitude, meanSunSiderealLongitude } from './mean-longitudes.js';

// =============================================================================
// Constants
// =============================================================================

/** The 7 planets that take part (BPHS 27: "the nodes are not considered"). */
const SHADBALA_PLANETS: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

/** Minimum total in virupas for a planet to count as strong (BPHS 27.32-33). */
const REQUIRED_VIRUPAS: Record<string, number> = {
  Sun: 390,
  Moon: 360,
  Mars: 300,
  Mercury: 420,
  Jupiter: 390,
  Venus: 330,
  Saturn: 300,
};

/** Naisargika Bala: 60/7 times 1 to 7 for Saturn, Mars, Mercury, Jupiter, Venus, Moon, Sun (BPHS 27.14). */
const NAISARGIKA_RANK: Record<string, number> = {
  Saturn: 1,
  Mars: 2,
  Mercury: 3,
  Jupiter: 4,
  Venus: 5,
  Moon: 6,
  Sun: 7,
};

/** Moolatrikona sign and degree range (BPHS 3.51-54, register BPHS-3.51-54). */
const MOOLATRIKONA: Record<string, { sign: ZodiacSign; startDeg: number; endDeg: number }> = {
  Sun: { sign: 'Leo', startDeg: 0, endDeg: 20 },
  Moon: { sign: 'Taurus', startDeg: 3, endDeg: 30 },
  Mars: { sign: 'Aries', startDeg: 0, endDeg: 12 },
  Mercury: { sign: 'Virgo', startDeg: 15, endDeg: 20 },
  Jupiter: { sign: 'Sagittarius', startDeg: 0, endDeg: 10 },
  Venus: { sign: 'Libra', startDeg: 0, endDeg: 15 },
  Saturn: { sign: 'Aquarius', startDeg: 0, endDeg: 20 },
};

const TRIBHAGA_DAY: Planet[] = ['Mercury', 'Sun', 'Saturn'];
const TRIBHAGA_NIGHT: Planet[] = ['Moon', 'Venus', 'Mars'];

/** Weekday lords: 0 = Sunday ... 6 = Saturday. */
const WEEKDAY_LORDS: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

/** Hora lords in order from the weekday lord: Sun, Venus, Mercury, Moon, Saturn, Jupiter, Mars. */
const HORA_SEQUENCE: Planet[] = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars'];

// =============================================================================
// Helpers
// =============================================================================

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** Shortest arc between two longitudes, 0 to 180. */
const angularDistance = (a: number, b: number): number => {
  const d = norm360(a - b);
  return d > 180 ? 360 - d : d;
};

const signIndexOf = (longitude: number): number => Math.floor(norm360(longitude) / 30);

function planetOf(chart: ChartData, planet: Planet): PlanetPosition | undefined {
  return chart.planets.find((p) => p.planet === planet);
}

/** The Ascendant's sidereal longitude. */
function ascendantLongitude(chart: ChartData): number {
  return norm360(chart.ascendant.signIndex * 30 + chart.ascendant.degree);
}

/**
 * The Midheaven's sidereal longitude. Charts cast before it was stored fall
 * back to the 10th cusp of an equal-house chart from the Ascendant, which can
 * be off by some degrees.
 */
function midheavenLongitude(chart: ChartData): number {
  return chart.midheaven !== undefined
    ? norm360(chart.midheaven)
    : norm360(ascendantLongitude(chart) - 90);
}

/** The instant a chart was cast for, from its Julian Day (UT). */
function instantOf(chartData: ChartData): Date {
  return new Date((chartData.julianDay - 2440587.5) * 86_400_000);
}

// =============================================================================
// Who rules the year, month, day, hour and third of the day (BPHS 27.12-13)
// =============================================================================

/**
 * The planets that rule the weekday, the hour, the third of the day or night,
 * the year and the month at the instant described by `day`.
 *
 * Day lord: the weekday of the Hindu day, sunrise to sunrise. Hora lord: the
 * day is cut into 24 EQUAL hours from sunrise (BPHS: "divided into 24 equal
 * parts of one hour or 2.5 ghatikas"), the first belonging to the day lord and
 * the rest following the order Sun, Venus, Mercury, Moon, Saturn, Jupiter,
 * Mars. (The Panchang's hora list uses twelfths of the day and of the night,
 * which is the almanac's convention, not this one.) Year and month lords come
 * from the Ahargana (rules/ahargana.ts).
 */
export function kalaLords(day: DayContext): {
  dinaLord: Planet;
  horaLord: Planet;
  tribhagaLord: Planet;
  varshaLord: Planet;
  masaLord: Planet;
} {
  const weekday = ((day.weekday % 7) + 7) % 7;
  const dinaLord = WEEKDAY_LORDS[weekday] ?? 'Sun';
  const horaIndex = Math.min(23, Math.max(0, Math.floor(day.hoursSinceSunrise)));
  const horaLord = HORA_SEQUENCE[(HORA_SEQUENCE.indexOf(dinaLord) + horaIndex) % 7] ?? 'Sun';
  const third = Math.min(2, Math.max(0, Math.floor(day.fraction * 3)));
  const tribhagaLord = (day.isDay ? TRIBHAGA_DAY : TRIBHAGA_NIGHT)[third] ?? 'Mercury';
  const varshaLord = WEEKDAY_LORDS[varshaLordIndex(day.civilDate)] ?? 'Sun';
  const masaLord = WEEKDAY_LORDS[masaLordIndex(day.civilDate)] ?? 'Sun';
  return { dinaLord, horaLord, tribhagaLord, varshaLord, masaLord };
}

// =============================================================================
// 1. Sthana Bala (positional strength), BPHS 27.1-6
// =============================================================================

/**
 * Uchcha Bala: the arc from the planet's deep debilitation point, folded to at
 * most 180 degrees, divided by 3. Worked example in the chapter: the Sun at
 * Pisces 12 deg 15 min, deep debilitation at Libra 10 deg: 152 deg 15 min / 3 =
 * 50.75 virupas.
 */
export function uchchaBala(planet: Planet, longitude: number): number {
  const debilitation = PLANET_DEBILITATION[planet];
  if (!debilitation) return 0;
  const point = ZODIAC_SIGNS.indexOf(debilitation.sign) * 30 + debilitation.degree;
  return angularDistance(longitude, point) / 3;
}

type Dignity = 'moolatrikona' | 'own' | 'adhimitra' | 'mitra' | 'sama' | 'shatru' | 'adhishatru';

const SAPTAVARGAJA_POINTS: Record<'bphs' | 'raman', Record<Dignity, number>> = {
  bphs: { moolatrikona: 45, own: 30, adhimitra: 20, mitra: 15, sama: 10, shatru: 4, adhishatru: 2 },
  raman: {
    moolatrikona: 45,
    own: 30,
    adhimitra: 22.5,
    mitra: 15,
    sama: 7.5,
    shatru: 3.75,
    adhishatru: 1.875,
  },
};

/**
 * The five-fold (Panchadha) relation of a planet to the lord of the division it
 * stands in: natural friendship combined with temporary friendship, the
 * temporary one read from the SIGN chart only (planets in the 2nd, 3rd, 4th,
 * 10th, 11th or 12th sign from each other are temporary friends).
 */
function panchadhaRelation(
  planet: Planet,
  lord: Planet,
  planetSign: number,
  lordSign: number | undefined,
): Dignity {
  const natural = naturalRelation(planet, lord);
  const diff = lordSign === undefined ? 1 : (((lordSign - planetSign) % 12) + 12) % 12;
  const temporaryFriend = [1, 2, 3, 9, 10, 11].includes(diff);
  if (natural === 'friend') return temporaryFriend ? 'adhimitra' : 'sama';
  if (natural === 'enemy') return temporaryFriend ? 'sama' : 'adhishatru';
  return temporaryFriend ? 'mitra' : 'shatru';
}

/** Dignity of a planet in the sign chart, where the moolatrikona degree range applies. */
function rasiDignity(planet: Planet, longitude: number, chart: ChartData): Dignity {
  const signIndex = signIndexOf(longitude);
  const sign = ZODIAC_SIGNS[signIndex] as ZodiacSign;
  const degree = norm360(longitude) % 30;
  const mt = MOOLATRIKONA[planet];
  if (mt && sign === mt.sign && degree >= mt.startDeg && degree <= mt.endDeg) return 'moolatrikona';
  if (PLANET_OWN_SIGNS[planet]?.includes(sign)) return 'own';
  const lord = SIGN_LORDS[sign];
  return panchadhaRelation(planet, lord, signIndex, planetOf(chart, lord)?.signIndex);
}

/** Dignity in a division whose result is a sign (drekkana, saptamsa, navamsa, dvadasamsa). */
function vargaSignDignity(
  planet: Planet,
  signIndex: number,
  planetSign: number,
  chart: ChartData,
): Dignity {
  const sign = ZODIAC_SIGNS[signIndex] as ZodiacSign;
  const lord = SIGN_LORDS[sign];
  if (lord === planet) {
    const mt = MOOLATRIKONA[planet];
    const wholeSign = getActiveProfile().moolatrikonaInVargas === 'sign';
    return wholeSign && mt?.sign === sign ? 'moolatrikona' : 'own';
  }
  return panchadhaRelation(planet, lord, planetSign, planetOf(chart, lord)?.signIndex);
}

/** Dignity in a division named for its lord (hora, trimsamsa): own when the lord is the planet itself. */
function vargaLordDignity(
  planet: Planet,
  lord: Planet,
  planetSign: number,
  chart: ChartData,
): Dignity {
  if (lord === planet) return 'own';
  return panchadhaRelation(planet, lord, planetSign, planetOf(chart, lord)?.signIndex);
}

/**
 * Saptavargaja Bala: the dignity of the planet in each of the seven divisions
 * (sign, hora, drekkana, saptamsa, navamsa, dvadasamsa, trimsamsa), scored with
 * the points of BPHS 27.2-3 and added up. The relation to each division's lord
 * uses the lord's place in the SIGN chart.
 */
export function saptavargajaBala(planet: Planet, longitude: number, chart: ChartData): number {
  const points = SAPTAVARGAJA_POINTS[getActiveProfile().saptavargajaPoints];
  const planetSign = signIndexOf(longitude);
  const horaLord: Planet = calculateD2(longitude) === 4 ? 'Sun' : 'Moon';
  const trimsamsaLord = SIGN_LORDS[ZODIAC_SIGNS[calculateD30(longitude)] as ZodiacSign];

  const dignities: Dignity[] = [
    rasiDignity(planet, longitude, chart),
    vargaLordDignity(planet, horaLord, planetSign, chart),
    vargaSignDignity(planet, calculateD3(longitude), planetSign, chart),
    vargaSignDignity(planet, calculateD7(longitude), planetSign, chart),
    vargaSignDignity(planet, calculateD9(longitude), planetSign, chart),
    vargaSignDignity(planet, calculateD12(longitude), planetSign, chart),
    vargaLordDignity(planet, trimsamsaLord, planetSign, chart),
  ];
  return dignities.reduce((sum, d) => sum + points[d], 0);
}

/**
 * Ojhayugmarasyamsa Bala (BPHS 27.5): 15 virupas for standing in an ODD sign
 * (Sun, Mars, Jupiter, Mercury, Saturn) or an EVEN sign (Moon, Venus), and the
 * same again for the navamsa sign. Mercury takes the odd signs with the
 * others; it does not score in both.
 */
export function ojhayugmaBala(planet: Planet, longitude: number): number {
  const wantsEven = planet === 'Moon' || planet === 'Venus';
  const fits = (signIndex: number) => (signIndex % 2 === 1) === wantsEven;
  return (fits(signIndexOf(longitude)) ? 15 : 0) + (fits(calculateD9(longitude)) ? 15 : 0);
}

/** Kendradi Bala (BPHS 27.5): 60 in an angle, 30 in a succedent, 15 in a cadent house. */
export function kendradiBala(house: number): number {
  if ([1, 4, 7, 10].includes(house)) return 60;
  if ([2, 5, 8, 11].includes(house)) return 30;
  return 15;
}

/**
 * Drekkana Bala (BPHS 27.6): 15 virupas for a male planet (Sun, Mars, Jupiter)
 * in the first drekkana, a neuter one (Mercury, Saturn) in the second, a
 * female one (Moon, Venus) in the third. The verse lists male, neuter, female
 * for first, middle, last. The translator's note swaps the last two; the
 * verse is followed (register BPHS-27.6).
 */
export function drekkanaBala(planet: Planet, longitude: number): number {
  const drekkana = Math.floor((norm360(longitude) % 30) / 10);
  const wanted = ['Sun', 'Mars', 'Jupiter'].includes(planet)
    ? 0
    : ['Mercury', 'Saturn'].includes(planet)
      ? 1
      : 2;
  return drekkana === wanted ? 15 : 0;
}

function sthanaBala(planet: Planet, chart: ChartData): number {
  const pos = planetOf(chart, planet);
  if (!pos) return 0;
  return (
    uchchaBala(planet, pos.longitude) +
    saptavargajaBala(planet, pos.longitude, chart) +
    ojhayugmaBala(planet, pos.longitude) +
    kendradiBala(pos.house) +
    drekkanaBala(planet, pos.longitude)
  );
}

// =============================================================================
// 2. Dig Bala (directional strength), BPHS 27.7-8
// =============================================================================

/**
 * Dig Bala: measured in degrees from the point where the planet has NO
 * strength, divided by 3 (so 60 on the cusp of full strength, 0 on the
 * opposite cusp). Full strength: Jupiter and Mercury at the Ascendant, the Sun
 * and Mars at the Midheaven, Saturn at the Descendant, the Moon and Venus at
 * the Nadir. Example: Saturn exactly on the Descendant 60, exactly on the
 * Ascendant 0.
 */
export function digBala(
  planet: Planet,
  longitude: number,
  ascendant: number,
  midheaven: number,
): number {
  const strongPoint =
    planet === 'Jupiter' || planet === 'Mercury'
      ? ascendant
      : planet === 'Sun' || planet === 'Mars'
        ? midheaven
        : planet === 'Saturn'
          ? ascendant + 180
          : midheaven + 180; // Moon, Venus: the Nadir
  return (180 - angularDistance(longitude, strongPoint)) / 3;
}

// =============================================================================
// 3. Kala Bala (temporal strength), BPHS 27.8-17
// =============================================================================

/**
 * Nathonnatha Bala: the Moon, Mars and Saturn are strong at night, the Sun,
 * Jupiter and Venus by day, Mercury always. The arc from apparent midnight
 * (UNNATA) taken from 30 ghatis is NATA; twice the Nata, in ghatis, is the
 * strength of the Moon, Mars and Saturn, and 60 less that is the strength of
 * the Sun, Jupiter and Venus. In hours from midnight (2.5 ghatis an hour):
 * night group = 60 - 5 x hours from midnight; day group = 5 x hours.
 */
export function nathonnathaBala(planet: Planet, hoursFromSolarNoon: number): number {
  if (planet === 'Mercury') return 60;
  const sinceNoon = ((hoursFromSolarNoon % 24) + 24) % 24;
  const fromNoon = Math.min(sinceNoon, 24 - sinceNoon);
  const fromMidnight = 12 - fromNoon;
  const nightGroup = 60 - 5 * fromMidnight;
  return planet === 'Moon' || planet === 'Mars' || planet === 'Saturn'
    ? nightGroup
    : 60 - nightGroup;
}

/**
 * Paksha Bala: the arc between the Moon and the Sun, folded to at most 180
 * degrees, divided by 3, is the strength of the Moon, Mercury, Venus and
 * Jupiter; 60 less that is the strength of the Sun, Mars and Saturn. It is
 * highest for the benefics at the full Moon and nil at the new Moon, and
 * symmetrical either side of the full Moon.
 */
export function pakshaBala(planet: Planet, moonSunArc: number): number {
  const folded = angularDistance(moonSunArc, 0);
  const benefic = folded / 3;
  return planet === 'Sun' || planet === 'Mars' || planet === 'Saturn' ? 60 - benefic : benefic;
}

/** Tribhaga Bala: 60 to the lord of the third of the day or night, and always 60 to Jupiter (BPHS 27.12). */
function tribhagaBala(planet: Planet, day: DayContext): number {
  if (planet === 'Jupiter') return 60;
  return kalaLords(day).tribhagaLord === planet ? 60 : 0;
}

/** Varsha, Masa, Dina and Hora Bala: 15, 30, 45 and 60 virupas to the lords of the year, month, day and hour (BPHS 27.13). */
function varshaMasaDinaHoraBala(planet: Planet, day: DayContext): number {
  const lords = kalaLords(day);
  return (
    (planet === lords.varshaLord ? 15 : 0) +
    (planet === lords.masaLord ? 30 : 0) +
    (planet === lords.dinaLord ? 45 : 0) +
    (planet === lords.horaLord ? 60 : 0)
  );
}

/** Cumulative and per-sign khandas (45, 33, 12): a stepwise sine, 90 x sin of the arc from the equinox. */
const KHANDA = [45, 33, 12];
const KHANDA_CUMULATIVE = [0, 45, 78];

/**
 * Ayana Bala (BPHS 27.15-17), by the khanda method of the verse. The arc of
 * the planet's TROPICAL longitude from the nearer equinox (the bhuja) is run
 * through the khandas to give 0-90, which is added to (or taken from) 90 and
 * divided by 3. The Sun, Mars, Jupiter and Venus are strong in the northern
 * half of the zodiac (Aries to Virgo), the Moon and Saturn in the southern
 * half, and Mercury takes the added form always.
 */
export function ayanaBala(planet: Planet, tropicalLongitude: number): number {
  const lambda = norm360(tropicalLongitude);
  const bhuja =
    lambda < 90 ? lambda : lambda < 180 ? 180 - lambda : lambda < 270 ? lambda - 180 : 360 - lambda;
  const k = Math.min(2, Math.floor(bhuja / 30));
  const stepped = (KHANDA_CUMULATIVE[k] ?? 0) + ((bhuja - 30 * k) * (KHANDA[k] ?? 0)) / 30;
  const northern = lambda < 180;
  const addsInNorth =
    planet === 'Sun' || planet === 'Mars' || planet === 'Jupiter' || planet === 'Venus';
  const adds = planet === 'Mercury' ? true : addsInNorth ? northern : !northern;
  return (90 + (adds ? stepped : -stepped)) / 3;
}

function moonSunArc(chart: ChartData): number {
  const sun = planetOf(chart, 'Sun');
  const moon = planetOf(chart, 'Moon');
  return sun && moon ? norm360(moon.longitude - sun.longitude) : 0;
}

function ayanaBalaOf(planet: Planet, chart: ChartData): number {
  const pos = planetOf(chart, planet);
  if (!pos) return 0;
  const value = ayanaBala(planet, pos.longitude + chart.ayanamsaValue);
  const doubled = planet === 'Sun' && getActiveProfile().kalaDoubling === 'sun-ayana-moon-paksha';
  return doubled ? value * 2 : value;
}

function pakshaBalaOf(planet: Planet, chart: ChartData): number {
  const value = pakshaBala(planet, moonSunArc(chart));
  const doubled = planet === 'Moon' && getActiveProfile().kalaDoubling === 'sun-ayana-moon-paksha';
  return doubled ? value * 2 : value;
}

function kalaBala(planet: Planet, chart: ChartData, day: DayContext): number {
  return (
    nathonnathaBala(planet, day.hoursFromSolarNoon) +
    pakshaBalaOf(planet, chart) +
    tribhagaBala(planet, day) +
    varshaMasaDinaHoraBala(planet, day) +
    ayanaBalaOf(planet, chart)
  );
}

// =============================================================================
// 4. Cheshta Bala (motional strength), BPHS 27.18, 27.24-25
// =============================================================================

/** Circular mean of two longitudes. */
function midpointLongitude(a: number, b: number): number {
  const half = (((((b - a + 540) % 360) + 360) % 360) - 180) / 2;
  return norm360(a + half);
}

/**
 * Cheshta Kendra of Mars to Saturn: the planet's own sighrocca minus the
 * average of its MEAN and TRUE longitudes, folded to at most 180 degrees. For
 * Mars, Jupiter and Saturn the sighrocca is the Sun's mean longitude and the
 * mean position is the planet's mean heliocentric longitude; for Mercury and
 * Venus it is the other way round. Cheshta Bala is that arc divided by 3: nil
 * when the planet is in line with its sighrocca, 60 when opposite it.
 */
export function cheshtaKendra(
  planet: 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn',
  trueLongitude: number,
  julianDay: number,
  ayanamsaValue: number,
): number {
  const sunMean = meanSunSiderealLongitude(julianDay, ayanamsaValue);
  const ownMean = meanSiderealLongitude(planet, julianDay, ayanamsaValue);
  const inner = planet === 'Mercury' || planet === 'Venus';
  const sighrocca = inner ? ownMean : sunMean;
  const mean = inner ? sunMean : ownMean;
  return angularDistance(sighrocca, midpointLongitude(mean, trueLongitude));
}

function cheshtaBala(planet: Planet, chart: ChartData): number {
  if (planet === 'Sun') return ayanaBalaOf('Sun', chart);
  if (planet === 'Moon') return pakshaBalaOf('Moon', chart);
  const pos = planetOf(chart, planet);
  if (!pos) return 0;
  if (
    planet === 'Mars' ||
    planet === 'Mercury' ||
    planet === 'Jupiter' ||
    planet === 'Venus' ||
    planet === 'Saturn'
  ) {
    return cheshtaKendra(planet, pos.longitude, chart.julianDay, chart.ayanamsaValue) / 3;
  }
  return 0;
}

// =============================================================================
// 5. Naisargika Bala (natural strength), BPHS 27.14
// =============================================================================

function naisargikaBala(planet: Planet): number {
  return ((NAISARGIKA_RANK[planet] ?? 0) * 60) / 7;
}

// =============================================================================
// 6. Drik Bala (aspectual strength), BPHS 26.6-12 and 27.19
// =============================================================================

/**
 * The aspect value, in virupas, of a planet on a point `arc` degrees ahead of
 * it (the longitude of the aspected minus that of the aspector). Between 30
 * and 300 degrees it rises and falls in the stages BPHS 26.6-8 gives, reaching
 * 60 at 180 degrees (the 7th), and Mars, Jupiter and Saturn gain the extra
 * that makes their special aspects full: Mars 15 in the 90-120 and 210-240
 * degree bands, Jupiter 30 in 120-150 and 240-270, Saturn 45 in 60-90 and
 * 270-300 (BPHS 26.11-12 and the translator's rule list).
 */
export function drishtiVirupa(aspector: Planet, arc: number): number {
  const a = norm360(arc);
  let value: number;
  if (a < 30 || a >= 300) value = 0;
  else if (a < 60) value = (a - 30) / 2;
  else if (a < 90) value = a - 60 + 15;
  else if (a < 120) value = (120 - a) / 2 + 30;
  else if (a < 150) value = 150 - a;
  else if (a < 180) value = (a - 150) * 2;
  else value = (300 - a) / 2;

  if (aspector === 'Mars' && ((a >= 90 && a < 120) || (a >= 210 && a < 240))) value += 15;
  if (aspector === 'Jupiter' && ((a >= 120 && a < 150) || (a >= 240 && a < 270))) value += 30;
  if (aspector === 'Saturn' && ((a >= 60 && a < 90) || (a >= 270 && a < 300))) value += 45;
  return value;
}

/**
 * Drik Bala (BPHS 27.19): a quarter of the aspect values of the benefics on
 * the planet, less a quarter of those of the malefics. It is negative when
 * malefic aspects outweigh. Which planets are benefic comes from the chart
 * (rules/nature.ts). The verse's further "add the aspect of Mercury and
 * Jupiter" is read in more than one way and is not applied (register BPHS-27.19).
 */
function drikBala(planet: Planet, chart: ChartData): number {
  const pos = planetOf(chart, planet);
  if (!pos) return 0;
  let total = 0;
  for (const other of SHADBALA_PLANETS) {
    if (other === planet) continue;
    const otherPos = planetOf(chart, other);
    if (!otherPos) continue;
    const value = drishtiVirupa(other, pos.longitude - otherPos.longitude);
    total += (natureOf(other, chart) === 'benefic' ? value : -value) / 4;
  }
  return total;
}

// =============================================================================
// Main Shadbala function
// =============================================================================

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Six-fold strength of the seven planets, in virupas.
 *
 * @param chartData - the cast chart (planets, ascendant, midheaven, ayanamsa)
 * @param day - the sunrise-to-sunrise day of the birth at the birth place
 *   (rules/day.ts `getAstroDay` + `dayContextAt`). When the place is not to
 *   hand it is estimated from the chart's own Ascendant.
 */
export function calculateShadbala(chartData: ChartData, day?: DayContext | null): PlanetShadbala[] {
  const results: PlanetShadbala[] = [];
  const dayContext = day ?? estimateDayContext(chartData, instantOf(chartData));
  const ascendant = ascendantLongitude(chartData);
  const midheaven = midheavenLongitude(chartData);

  for (const planet of SHADBALA_PLANETS) {
    const pos = planetOf(chartData, planet);
    if (!pos) continue;

    const sthana = sthanaBala(planet, chartData);
    const dig = digBala(planet, pos.longitude, ascendant, midheaven);
    const kala = kalaBala(planet, chartData, dayContext);
    const cheshta = cheshtaBala(planet, chartData);
    const naisargika = naisargikaBala(planet);
    const drik = drikBala(planet, chartData);

    const total = sthana + dig + kala + cheshta + naisargika + drik;
    const required = REQUIRED_VIRUPAS[planet] ?? 300;

    results.push({
      planet,
      sthanaBala: round2(sthana),
      digBala: round2(dig),
      kalaBala: round2(kala),
      cheshtaBala: round2(cheshta),
      naisargikaBala: round2(naisargika),
      drikBala: round2(drik),
      totalVirupas: round2(total),
      requiredVirupas: required,
      isStrong: total >= required,
    });
  }

  return results;
}
