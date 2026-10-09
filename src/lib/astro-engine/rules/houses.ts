// =============================================================================
// House counting and graha drishti (aspects) — one definition for the engine
// =============================================================================
// Jyotish counts houses inclusively: the house a planet sits in is the 1st
// from it, the opposite house is the 7th. Every helper here speaks in those
// ordinals (1-12), never in "steps" (0-11).
//
// Why this file exists: yogas/index.ts had a private `houseDistance` that
// returned steps (7th house = 6) while its callers compared the result with
// ordinals (7), so every aspect in the yoga detector was read one house late
// and most "mutual kendra" tests looked at the 2nd/5th/8th/11th (audit items
// YG1-YG3, docs/engine-audit/C-critical-corrections.md). The aspect checks in
// doshas/, lalkitab/debts.ts, calculations/vakri.ts and astro-tools/transit.ts
// were each written separately and happen to be right; they should move here
// as they are next touched so there is one rule to verify against the text.
//
// Source status: the special aspects of Mars, Jupiter and Saturn are not yet
// recorded in docs/engine-audit/D-source-register.md. Until they are, this is
// the rule the engine already used everywhere else, stated once.
// =============================================================================

import type { ChartData, Planet, ZodiacSign } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS } from '@aroha-astrology/shared';

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/**
 * Which house `to` is, counted from `from` (both 1-12, or both 0-11 sign
 * indices — only the difference matters). Same place = 1, opposite = 7.
 */
export function houseFrom(from: number, to: number): number {
  return mod12(to - from) + 1;
}

/** The house that is the `n`th from `from` (1-12). nthHouseFrom(12, 2) === 1. */
export function nthHouseFrom(from: number, n: number): number {
  return mod12(from - 1 + n - 1) + 1;
}

const KENDRA = [1, 4, 7, 10];
const TRIKONA = [1, 5, 9];
const DUSTHANA = [6, 8, 12];

/** Is `to` in a kendra (1st, 4th, 7th or 10th) counted from `from`? Conjunction counts. */
export function isKendraFrom(from: number, to: number): boolean {
  return KENDRA.includes(houseFrom(from, to));
}

export function isTrikonaFrom(from: number, to: number): boolean {
  return TRIKONA.includes(houseFrom(from, to));
}

export function isDusthanaFrom(from: number, to: number): boolean {
  return DUSTHANA.includes(houseFrom(from, to));
}

/** Extra full aspects beyond the 7th that every planet has. */
const SPECIAL_ASPECTS: Partial<Record<Planet, readonly number[]>> = {
  Mars: [4, 8],
  Jupiter: [5, 9],
  Saturn: [3, 10],
};

/** The houses (as ordinals from the planet) a planet aspects by whole house. */
export function aspectedOrdinals(planet: Planet): number[] {
  return [7, ...(SPECIAL_ASPECTS[planet] ?? [])];
}

/** Does a planet standing in `planetHouse` aspect `targetHouse`? Pure numbers, no chart. */
export function aspectsHouse(planet: Planet, planetHouse: number, targetHouse: number): boolean {
  return aspectedOrdinals(planet).includes(houseFrom(planetHouse, targetHouse));
}

/** House (1-12) a planet occupies in a chart, or 0 when the chart does not have it. */
export function houseOfPlanet(planet: Planet, chart: ChartData): number {
  return chart.planets.find((p) => p.planet === planet)?.house ?? 0;
}

export function planetAspectsHouse(planet: Planet, targetHouse: number, chart: ChartData): boolean {
  const from = houseOfPlanet(planet, chart);
  return from !== 0 && aspectsHouse(planet, from, targetHouse);
}

export function planetAspectsPlanet(aspector: Planet, target: Planet, chart: ChartData): boolean {
  const to = houseOfPlanet(target, chart);
  return to !== 0 && planetAspectsHouse(aspector, to, chart);
}

// ---------------------------------------------------------------------------
// Sign classes (0 = Aries .. 11 = Pisces)
// ---------------------------------------------------------------------------

export function signIndexOf(sign: ZodiacSign): number {
  return ZODIAC_SIGNS.indexOf(sign);
}

/** Aries, Gemini, Leo, Libra, Sagittarius, Aquarius. */
export function isOddSignIndex(signIndex: number): boolean {
  return mod12(signIndex) % 2 === 0;
}

export type SignModality = 'movable' | 'fixed' | 'dual';

export function signModality(signIndex: number): SignModality {
  return (['movable', 'fixed', 'dual'] as const)[mod12(signIndex) % 3]!;
}
