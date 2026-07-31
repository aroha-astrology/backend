// =============================================================================
// Sahams (Arabic Parts) — Tajik sensitive points for the Varshphal year
// =============================================================================
// All formulas and the Vivaha Saham +30 degree conditional are exactly as
// specified in the audit this responds to. The +30 condition is applied ONLY
// to Vivaha Saham, matching what was actually specified -- it is NOT
// generalized to the other four Sahams, which the audit gave as plain
// formulas with no such caveat; extending an unstated rule to them would be
// fabricating specificity the source didn't provide.
// =============================================================================

import { getAspectedSigns, SIGNS } from '../../astro-tools/transit.js';
import type { ChartData } from '@aroha-astrology/shared';

function normalizeDegree(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Does `test` lie on the forward (increasing-longitude) zodiacal arc
 * starting at `from` and ending at `to`? Used only by Vivaha Saham's
 * documented +30 condition.
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
  houseFromVarshaAsc: number;
  /** True when Jupiter or Venus aspects (or occupies) the Saham's sign — the audit's "predicted to manifest" condition. */
  beneficSupported: boolean;
}

function planetLongitude(chart: ChartData, planet: string): number {
  return chart.planets.find((p) => p.planet === planet)?.longitude ?? 0;
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
    houseFromVarshaAsc,
    beneficSupported,
  };
}

/** Vivaha Saham (marriage/partnership) — Venus - Saturn + Ascendant, +30 if Ascendant does not fall between Saturn and Venus moving zodiacally. */
export function vivahaSaham(varshaChart: ChartData): SahamResult {
  const venus = planetLongitude(varshaChart, 'Venus');
  const saturn = planetLongitude(varshaChart, 'Saturn');
  const asc = varshaChart.ascendant.degree + varshaChart.ascendant.signIndex * 30;

  let longitude = normalizeDegree(venus - saturn + asc);
  if (!isBetweenZodiacally(saturn, venus, asc)) longitude = normalizeDegree(longitude + 30);

  return buildSahamResult('Vivaha (Marriage)', longitude, varshaChart);
}

/** Punya Saham (Fortune) — day: Moon - Sun + Asc; night: Sun - Moon + Asc. */
export function punyaSaham(varshaChart: ChartData, isDayReturn: boolean): SahamResult {
  const sun = planetLongitude(varshaChart, 'Sun');
  const moon = planetLongitude(varshaChart, 'Moon');
  const asc = varshaChart.ascendant.degree + varshaChart.ascendant.signIndex * 30;
  const longitude = isDayReturn ? moon - sun + asc : sun - moon + asc;
  return buildSahamResult('Punya (Fortune)', longitude, varshaChart);
}

/** Vidya Saham (Education) — Asc + Mercury - Moon. */
export function vidyaSaham(varshaChart: ChartData): SahamResult {
  const mercury = planetLongitude(varshaChart, 'Mercury');
  const moon = planetLongitude(varshaChart, 'Moon');
  const asc = varshaChart.ascendant.degree + varshaChart.ascendant.signIndex * 30;
  return buildSahamResult('Vidya (Education)', asc + mercury - moon, varshaChart);
}

/** Rajya Saham (Career/Authority) — Asc + Sun - Moon. */
export function rajyaSaham(varshaChart: ChartData): SahamResult {
  const sun = planetLongitude(varshaChart, 'Sun');
  const moon = planetLongitude(varshaChart, 'Moon');
  const asc = varshaChart.ascendant.degree + varshaChart.ascendant.signIndex * 30;
  return buildSahamResult('Rajya (Career/Authority)', asc + sun - moon, varshaChart);
}

/** Vitta Saham (Wealth) — Asc + Jupiter - Sun. */
export function vittaSaham(varshaChart: ChartData): SahamResult {
  const jupiter = planetLongitude(varshaChart, 'Jupiter');
  const sun = planetLongitude(varshaChart, 'Sun');
  const asc = varshaChart.ascendant.degree + varshaChart.ascendant.signIndex * 30;
  return buildSahamResult('Vitta (Wealth)', asc + jupiter - sun, varshaChart);
}

export function computeAllSahams(varshaChart: ChartData, isDayReturn: boolean): SahamResult[] {
  return [
    vivahaSaham(varshaChart),
    punyaSaham(varshaChart, isDayReturn),
    vidyaSaham(varshaChart),
    rajyaSaham(varshaChart),
    vittaSaham(varshaChart),
  ];
}
