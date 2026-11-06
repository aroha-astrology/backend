// =============================================================================
// Sahams (Arabic Parts) — Tajik sensitive points for the Varshphal year
// =============================================================================
// Every Saham is  plus - minus + add  (three longitudes). Two rules apply to ALL of them
// (changed deliberately in the Varshik 2027 work; before, +30 was only Vivaha's and only
// Punya reversed at night):
//   1. NIGHT: for a night return the `plus` and `minus` points swap, except for the Sahams
//      whose night form is a different formula (Karyasiddhi) or none (Pardesh).
//   2. +30: if `add` does not lie on the forward arc from `minus` to `plus` (after any
//      night swap), 30 degrees are added.
// The per-Saham switches live in SAHAM_RULES, so one that JHora disagrees with is a
// one-line change.
//
// SOURCES: no verse numbers are cited here because none was opened and checked. The
// formulas are the standard Tajika ones as the earlier audit gave them, plus Karyasiddhi,
// Pardesh and Putra, which are UNVERIFIED against JHora until the benchmark fixtures
// (backend/test/fixtures/varshik/) are recorded.
// =============================================================================

import { getAspectedSigns, SIGNS } from '../../astro-tools/transit.js';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { ChartData } from '@aroha-astrology/shared';

function normalizeDegree(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Does `test` lie on the forward (increasing-longitude) zodiacal arc
 * starting at `from` and ending at `to`?
 */
export function isBetweenZodiacally(from: number, to: number, test: number): boolean {
  const f = normalizeDegree(from);
  const t = normalizeDegree(to);
  const x = normalizeDegree(test);
  const arc = normalizeDegree(t - f);
  const pos = normalizeDegree(x - f);
  return pos <= arc;
}

export interface SahamResult {
  name: string;
  longitude: number;
  signIndex: number;
  sign: string;
  /** The lord of the Saham's sign: the planet whose transit counts double in saham-windows.ts. */
  lord: string;
  houseFromVarshaAsc: number;
  /** True when Jupiter or Venus aspects (or occupies) the Saham's sign — the audit's "predicted to manifest" condition. */
  beneficSupported: boolean;
}

function planetLongitude(chart: ChartData, planet: string): number {
  return chart.planets.find((p) => p.planet === planet)?.longitude ?? 0;
}

function ascLongitude(chart: ChartData): number {
  return chart.ascendant.degree + chart.ascendant.signIndex * 30;
}

function buildSahamResult(name: string, longitude: number, varshaChart: ChartData): SahamResult {
  const lon = normalizeDegree(longitude);
  const signIndex = Math.floor(lon / 30);
  const varshaAscSignIndex = varshaChart.ascendant.signIndex;
  const houseFromVarshaAsc = ((signIndex - varshaAscSignIndex + 12) % 12) + 1;

  const jupiterSignIndex = varshaChart.planets.find((p) => p.planet === 'Jupiter')?.signIndex;
  const venusSignIndex = varshaChart.planets.find((p) => p.planet === 'Venus')?.signIndex;
  const beneficSupported =
    signIndex === jupiterSignIndex ||
    signIndex === venusSignIndex ||
    (jupiterSignIndex !== undefined &&
      getAspectedSigns('Jupiter', jupiterSignIndex).includes(signIndex)) ||
    (venusSignIndex !== undefined && getAspectedSigns('Venus', venusSignIndex).includes(signIndex));

  return {
    name,
    longitude: lon,
    signIndex,
    sign: SIGNS[signIndex] ?? 'Unknown',
    lord: SIGN_LORDS[ZODIAC_SIGNS[signIndex]!] ?? 'Sun',
    houseFromVarshaAsc,
    beneficSupported,
  };
}

interface SahamPoints {
  plus: number;
  minus: number;
  add: number;
}

interface SahamRule {
  name: string;
  /** The three longitudes for a DAY return (a night-specific formula is returned when `isDay` is false). */
  points: (chart: ChartData, isDay: boolean) => SahamPoints;
  /** Swap `plus` and `minus` at night. */
  nightSwap: boolean;
  /** Add 30 when `add` is not between `minus` and `plus`. */
  plus30: boolean;
}

const ruleOf = (a: string, b: string, c: (chart: ChartData) => number) => (chart: ChartData) => ({
  plus: planetLongitude(chart, a),
  minus: planetLongitude(chart, b),
  add: c(chart),
});

/** The lord (a planet's longitude) of the sign a longitude is in. Nodes never rule a sign. */
function signLordLongitude(chart: ChartData, longitude: number): number {
  const sign = ZODIAC_SIGNS[Math.floor(normalizeDegree(longitude) / 30)]!;
  return planetLongitude(chart, SIGN_LORDS[sign]);
}

export const SAHAM_RULES = {
  vivaha: {
    name: 'Vivaha (Marriage)',
    points: ruleOf('Venus', 'Saturn', ascLongitude),
    nightSwap: true,
    plus30: true,
  },
  punya: {
    name: 'Punya (Fortune)',
    points: ruleOf('Moon', 'Sun', ascLongitude),
    nightSwap: true,
    plus30: true,
  },
  vidya: {
    name: 'Vidya (Education)',
    points: ruleOf('Mercury', 'Moon', ascLongitude),
    nightSwap: true,
    plus30: true,
  },
  rajya: {
    name: 'Rajya (Career/Authority)',
    points: ruleOf('Sun', 'Moon', ascLongitude),
    nightSwap: true,
    plus30: true,
  },
  vitta: {
    name: 'Vitta (Wealth)',
    points: ruleOf('Jupiter', 'Sun', ascLongitude),
    nightSwap: true,
    plus30: true,
  },
  // Karyasiddhi (success in undertakings): Saturn - Sun + the lord of the Sun's sign by day,
  // Saturn - Moon + the lord of the Moon's sign by night. Unverified against JHora.
  karyasiddhi: {
    name: 'Karyasiddhi (Success)',
    points: (chart, isDay) => {
      const body = planetLongitude(chart, isDay ? 'Sun' : 'Moon');
      return {
        plus: planetLongitude(chart, 'Saturn'),
        minus: body,
        add: signLordLongitude(chart, body),
      };
    },
    nightSwap: false,
    plus30: true,
  },
  // Pardesh (foreign travel and settling abroad): the 9th cusp - the 9th lord + the Lagna, the
  // same by day and night. Unverified against JHora.
  pardesh: {
    name: 'Pardesh (Foreign travel)',
    points: (chart) => {
      // Whole-sign fallback when a chart carries no house list.
      const ninthSign = (chart.ascendant.signIndex + 8) % 12;
      const ninth = chart.houses?.[8];
      return {
        plus: ninth?.cusp ?? ninthSign * 30,
        minus: planetLongitude(chart, ninth?.lord ?? SIGN_LORDS[ZODIAC_SIGNS[ninthSign]!]),
        add: ascLongitude(chart),
      };
    },
    nightSwap: false,
    plus30: true,
  },
  // Putra (children): Jupiter - Moon + the Lagna, swapped at night. Unverified against JHora.
  putra: {
    name: 'Putra (Children)',
    points: ruleOf('Jupiter', 'Moon', ascLongitude),
    nightSwap: true,
    plus30: true,
  },
} satisfies Record<string, SahamRule>;

export type SahamKey = keyof typeof SAHAM_RULES;

/** One Saham's longitude, with the shared night and +30 rules applied. */
export function sahamLongitude(rule: SahamRule, chart: ChartData, isDay: boolean): number {
  let { plus, minus } = rule.points(chart, isDay);
  const { add } = rule.points(chart, isDay);
  if (!isDay && rule.nightSwap) [plus, minus] = [minus, plus];

  let longitude = normalizeDegree(plus - minus + add);
  if (rule.plus30 && !isBetweenZodiacally(minus, plus, add)) {
    longitude = normalizeDegree(longitude + 30);
  }
  return longitude;
}

function build(key: SahamKey, chart: ChartData, isDay: boolean): SahamResult {
  const rule: SahamRule = SAHAM_RULES[key];
  return buildSahamResult(rule.name, sahamLongitude(rule, chart, isDay), chart);
}

/** Vivaha Saham (marriage/partnership) — Venus - Saturn + Ascendant. */
export const vivahaSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('vivaha', chart, isDayReturn);

/** Punya Saham (Fortune) — Moon - Sun + Asc by day; Sun - Moon + Asc by night. */
export const punyaSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('punya', chart, isDayReturn);

/** Vidya Saham (Education) — Asc + Mercury - Moon. */
export const vidyaSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('vidya', chart, isDayReturn);

/** Rajya Saham (Career/Authority) — Asc + Sun - Moon. */
export const rajyaSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('rajya', chart, isDayReturn);

/** Vitta Saham (Wealth) — Asc + Jupiter - Sun. */
export const vittaSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('vitta', chart, isDayReturn);

export const karyasiddhiSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('karyasiddhi', chart, isDayReturn);

export const pardeshSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('pardesh', chart, isDayReturn);

export const putraSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('putra', chart, isDayReturn);

export function computeAllSahams(varshaChart: ChartData, isDayReturn: boolean): SahamResult[] {
  return (Object.keys(SAHAM_RULES) as SahamKey[]).map((key) => build(key, varshaChart, isDayReturn));
}
