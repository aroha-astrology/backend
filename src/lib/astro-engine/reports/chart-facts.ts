// =============================================================================
// Shared chart-traversal primitives for the reports feature
// =============================================================================
// gemstones.ts (analyzePlanetStrengths, sign-dignity strength classification)
// already has private equivalents of getPlanetPos/getHousesRuledBy/isInHouse —
// this module is a FRESH implementation of the same small primitives, factored
// out so all 9 report generators share one traversal module instead of each
// reimplementing chart reads. gemstones.ts itself is untouched (it's a live,
// tested, paid feature) — nothing here imports from or mutates it, except the
// STRENGTH_SCORE mapping below which is keyed on `analyzePlanetStrengths`'s
// own `PlanetAnalysis['strength']` return type.
// =============================================================================

import type { VimshottariDasha } from '@aroha-astrology/shared';
import type { PlanetAnalysis, PlanetStrength } from '../gemstones.js';
import { calculateVimshottariDasha } from '../dashas/vimshottari.js';

export interface NatalPlanetFact {
  planet: string;
  sign?: string;
  signIndex?: number;
  house?: number;
  longitude?: number;
  isRetrograde?: boolean;
  nakshatraIndex?: number;
  nakshatraPada?: number;
}

export interface NatalHouseFact {
  house: number;
  lord: string;
  sign?: string;
}

/** Find a planet's natal position on the given chart (`kundli.chartData` shape). */
export function getPlanetPosition(
  planetName: string,
  chart: Record<string, unknown> | null,
): NatalPlanetFact | undefined {
  const planets = ((chart?.planets ?? []) as NatalPlanetFact[]) || [];
  return planets.find((p) => p.planet === planetName);
}

/** Find a house's computed data (house number, lord, sign) on the given chart. */
export function getHouseFact(
  houseNumber: number,
  chart: Record<string, unknown> | null,
): NatalHouseFact | undefined {
  const houses = ((chart?.houses ?? []) as NatalHouseFact[]) || [];
  return houses.find((h) => h.house === houseNumber);
}

/** The lord (ruling planet) of a given house number, or undefined if the chart has no house data. */
export function getHouseLord(
  houseNumber: number,
  chart: Record<string, unknown> | null,
): string | undefined {
  return getHouseFact(houseNumber, chart)?.lord;
}

/** The zodiac sign occupying a given house number (whole-sign houses), or undefined. */
export function getHouseSign(
  houseNumber: number,
  chart: Record<string, unknown> | null,
): string | undefined {
  return getHouseFact(houseNumber, chart)?.sign;
}

/** Every house number (1-12) whose lord is the given planet — a planet can rule 0, 1, or 2 houses. */
export function getHousesRuledBy(
  planetName: string,
  chart: Record<string, unknown> | null,
): number[] {
  const houses = ((chart?.houses ?? []) as NatalHouseFact[]) || [];
  return houses.filter((h) => h.lord === planetName).map((h) => h.house);
}

/** Whole-sign-house occupancy check: is the given planet physically sitting in one of `houseNumbers`? */
export function isPlanetInHouse(
  planetName: string,
  houseNumbers: number[],
  chart: Record<string, unknown> | null,
): boolean {
  const pos = getPlanetPosition(planetName, chart);
  return typeof pos?.house === 'number' && houseNumbers.includes(pos.house);
}

/**
 * Documented weak/average/strong -> 0-100 numeric mapping shared by every report generator
 * that folds `analyzePlanetStrengths`'s qualitative strength into a blended score. Chosen so
 * "weak" and "strong" are symmetric around "average" (60 - 30 = 90 - 60): 30 / 60 / 90.
 * A future change to this mapping is a single edit here, applied consistently to every
 * report type rather than drifting per-generator.
 */
export const STRENGTH_SCORE: Record<PlanetStrength, number> = {
  weak: 30,
  average: 60,
  strong: 90,
};

/** A planet's classified strength from an `analyzePlanetStrengths(chart)` result array; defaults to 'average' if the planet is somehow absent (defensive only — analyzePlanetStrengths always returns all 9). */
export function strengthOfPlanet(planetName: string, analyses: PlanetAnalysis[]): PlanetStrength {
  return analyses.find((a) => a.planet === planetName)?.strength ?? 'average';
}

/** `strengthOfPlanet` mapped through `STRENGTH_SCORE` — the single numeric building block every
 * generator's weighted-average scores are composed from. */
export function strengthScoreOfPlanet(planetName: string, analyses: PlanetAnalysis[]): number {
  return STRENGTH_SCORE[strengthOfPlanet(planetName, analyses)];
}

// =============================================================================
// Deriving a Vimshottari Dasha tree from `chart` alone
// =============================================================================
// `ReportScoreContext` (report-generator.types.ts) only carries `chart` — no
// separate birthDate field — yet the marriage report and all 4 monthly reports
// need the full Vimshottari Dasha tree (calculateVimshottariDasha needs a Moon
// sidereal longitude AND a birth Date). The chart itself doesn't store a
// birthDate either, but it does store `julianDay` (the birth moment's Julian
// Day, set when the chart was computed) and the Moon's sidereal longitude in
// `chart.planets`.
//
// src/lib/astro-engine/dashas/chara.ts already solves this exact problem for
// Chara Dasha via a private `julianDayToDate` (Meeus algorithm) — chara.ts is
// left untouched per this task's constraints, so `julianDayToDate` below is a
// fresh, independent implementation of the same standard published algorithm
// (Meeus, "Astronomical Algorithms"), not an import from or edit to chara.ts.
// =============================================================================

/** Convert a Julian Day Number to a JavaScript Date (UTC). Standard Meeus algorithm. */
export function julianDayToDate(jd: number): Date {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;

  let a: number;
  if (z < 2299161) {
    a = z;
  } else {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }

  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);

  const day = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  const totalHours = f * 24;
  const hours = Math.floor(totalHours);
  const totalMinutes = (totalHours - hours) * 60;
  const minutes = Math.floor(totalMinutes);
  const seconds = Math.floor((totalMinutes - minutes) * 60);

  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
}

/**
 * Derive the full Vimshottari Dasha tree from a chart alone — birth date recovered from
 * `chart.julianDay`, Moon sidereal longitude read from `chart.planets`. Returns null (never
 * throws) if either fact is missing, so callers can fail their own report generation cleanly
 * (the orchestration layer's fail-and-refund path, same as any other generation error).
 */
export function getVimshottariDashaFromChart(
  chart: Record<string, unknown> | null,
): VimshottariDasha | null {
  const julianDay = chart?.julianDay;
  if (typeof julianDay !== 'number') return null;

  const moon = getPlanetPosition('Moon', chart);
  if (typeof moon?.longitude !== 'number') return null;

  const birthDate = julianDayToDate(julianDay);
  return calculateVimshottariDasha(moon.longitude, birthDate);
}
