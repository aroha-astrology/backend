// =============================================================================
// Sahams (Arabic Parts) — Tajik sensitive points for the Varshphal year
// =============================================================================
// Every Saham is  plus - minus + add  (three longitudes). Two rules apply to ALL of them
// (changed deliberately in the Varshik 2027 work; before, +30 was only Vivaha's and only
// Punya reversed at night):
//   1. NIGHT: for a night return the `plus` and `minus` points swap, except for the Sahams
//      whose night form is a different formula (Karyasiddhi) or none (Pardesh).
//   2. +30: if `add` is not found going forward by SIGN from the sign of `minus` to the
//      sign of `plus` (after any night swap), 30 degrees are added. The test is by sign,
//      not by exact degree, as PyJHora (a JHora port) does it.
// The per-Saham switches live in SAHAM_RULES, so one that JHora disagrees with is a
// one-line change.
//
// SOURCES: no verse numbers are cited here because none was opened and checked. The
// formulas were aligned to PyJHora 4.8.7 (jhora/horoscope/transit/saham.py), a port of JHora,
// by reading its source on 2026-11-06; PyJHora could not be run here, so nothing is checked
// against real JHora output yet (backend/test/fixtures/varshik/jhora.json is empty). Before
// that alignment Vidya, Rajya and Vitta used the formulas of an earlier audit that no text
// backed; Vitta has no JHora counterpart and is replaced by Artha.
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

/**
 * JHora's real test (C0, b01 fixtures, 2026-11-07): "C between B and A" by exact longitude, the
 * ends NOT counted. On b01 it explains all 16 Saham cases: a Saham whose Asc point sits in the
 * same sign as A but past it (Rajya 2026) still gets the +30, and one whose Asc point sits exactly
 * on A (Karyasiddhi 2027) gets it too. The by-sign reading below (from PyJHora's source) does not.
 */
export function isStrictlyBetween(from: number, to: number, test: number): boolean {
  const arc = normalizeDegree(to - from);
  const pos = normalizeDegree(test - from);
  return pos > 0 && pos < arc;
}

/**
 * The by-sign reading from PyJHora's source: "C between B and A": walking forward by SIGN from the sign after B's, is C's sign
 * reached before A's sign is passed? C in the same sign as B counts as not between.
 */
export function isBetweenBySign(aLon: number, bLon: number, cLon: number): boolean {
  const a = Math.floor(normalizeDegree(aLon) / 30);
  const b = Math.floor(normalizeDegree(bLon) / 30);
  const c = Math.floor(normalizeDegree(cLon) / 30);
  for (let n = b; n < b + 11; n++) {
    const next = (n + 1) % 12;
    if (next === c) return true;
    if (next === a) return false;
  }
  return false;
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

export function buildSahamResult(name: string, longitude: number, varshaChart: ChartData): SahamResult {
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

export interface SahamPoints {
  plus: number;
  minus: number;
  add: number;
  /** The point the +30 test looks at, when it is not `add` (Karyasiddhi: the Lagna). */
  between?: number;
}

export interface SahamRule {
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

/** House `n` as JHora takes it: the Lagna longitude + (n-1)*30, with the lord of that sign. */
function housePoint(chart: ChartData, n: number): SahamPoints {
  const asc = ascLongitude(chart);
  const point = normalizeDegree(asc + (n - 1) * 30);
  const sign = ZODIAC_SIGNS[Math.floor(point / 30)]!;
  return { plus: point, minus: planetLongitude(chart, SIGN_LORDS[sign]), add: asc };
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
    points: ruleOf('Sun', 'Moon', ascLongitude),
    nightSwap: true,
    plus30: true,
  },
  rajya: {
    name: 'Rajya (Career/Authority)',
    points: ruleOf('Saturn', 'Sun', ascLongitude),
    nightSwap: true,
    plus30: true,
  },
  // Artha (money): the 2nd house point - the 2nd lord + the Lagna, the same by day and night.
  // The 2nd house point is the Lagna longitude + 30 (JHora's equal-house point, not the sign start).
  artha: {
    name: 'Artha (Wealth)',
    points: (chart) => housePoint(chart, 2),
    nightSwap: false,
    plus30: true,
  },
  // Karyasiddhi (success in undertakings): Saturn - Sun + the lord of the Sun's sign by day,
  // Saturn - Moon + the lord of the Moon's sign by night (as PyJHora has it).
  karyasiddhi: {
    name: 'Karyasiddhi (Success)',
    points: (chart, isDay) => {
      const body = planetLongitude(chart, isDay ? 'Sun' : 'Moon');
      return {
        plus: planetLongitude(chart, 'Saturn'),
        minus: body,
        add: signLordLongitude(chart, body),
        // JHora (C0, 20 chart-years of fixtures): the +30 test looks at the Lagna here, not at the
        // lord that is added. The lord-based test fits only 17 of the 20.
        between: ascLongitude(chart),
      };
    },
    nightSwap: false,
    plus30: true,
  },
  // Pardesh (foreign travel and settling abroad): the 9th house point - the 9th lord + the
  // Lagna, the same by day and night.
  pardesh: {
    name: 'Pardesh (Foreign travel)',
    points: (chart) => housePoint(chart, 9),
    nightSwap: false,
    plus30: true,
  },
  // Putra (children): Jupiter - Moon + the Lagna, swapped at night (as PyJHora has it).
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
  const { add, between } = rule.points(chart, isDay);
  if (!isDay && rule.nightSwap) [plus, minus] = [minus, plus];

  let longitude = normalizeDegree(plus - minus + add);
  if (rule.plus30 && !isStrictlyBetween(minus, plus, between ?? add)) {
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

/** Vidya Saham (Education) — Sun - Moon + Asc. */
export const vidyaSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('vidya', chart, isDayReturn);

/** Rajya Saham (Career/Authority) — Saturn - Sun + Asc. */
export const rajyaSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('rajya', chart, isDayReturn);

/** Artha Saham (Wealth) — 2nd house point - 2nd lord + Asc (replaced Vitta, which JHora does not have). */
export const arthaSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('artha', chart, isDayReturn);

export const karyasiddhiSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('karyasiddhi', chart, isDayReturn);

export const pardeshSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('pardesh', chart, isDayReturn);

export const putraSaham = (chart: ChartData, isDayReturn = true): SahamResult =>
  build('putra', chart, isDayReturn);

export function computeAllSahams(varshaChart: ChartData, isDayReturn: boolean): SahamResult[] {
  return (Object.keys(SAHAM_RULES) as SahamKey[]).map((key) => build(key, varshaChart, isDayReturn));
}
