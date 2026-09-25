// =============================================================================
// Relocation by life area — the same birth moment, read from another place
// =============================================================================
// Moving doesn't move the planets (their longitudes are geocentric), it
// moves the Ascendant: the same birth instant has a different rising sign at
// a different latitude/longitude, so every house — and which planets sit in
// it and which sign it holds — changes. This relocates the chart (whole-sign
// houses from the relocated Ascendant, Ashtakavarga recomputed because the
// Ascendant is one of its contributors) and scores six areas:
//   career 10th · relationships 7th · finance 2nd+11th ·
//   education 4th+5th+9th · family 4th · lifestyle 1st
// Each house: its Sarvashtakavarga points (28 is average), the natal planets
// sitting in it (benefics help; malefics strain, except in the 3rd/6th/10th/
// 11th where classical texts say they do well), and its lord's dignity
// (exalted/own sign helps, debilitated strains). The area's first house
// counts double. Rule-based, no AI.
// =============================================================================

import type { ChartData, Planet } from '@aroha-astrology/shared';
import {
  NATURAL_BENEFICS,
  NATURAL_MALEFICS,
  SIGN_LORDS,
  ZODIAC_SIGNS,
} from '@aroha-astrology/shared';
import { calculateAscendant } from '../calculations/planetPositions.js';
import { calculateAshtakavarga } from '../calculations/ashtakavarga.js';
import type { WhyFactor } from '../../intelligence/types.js';

export const RELOCATION_AREAS = {
  career: [10],
  relationships: [7],
  finance: [2, 11],
  education: [4, 5, 9],
  family: [4],
  lifestyle: [1],
} as const;
export type RelocationArea = keyof typeof RELOCATION_AREAS;

const UPACHAYA = new Set([3, 6, 10, 11]);
const SAV_AVERAGE = 28;

/** Sign index (0-11) where each graha is exalted; debilitation is opposite. */
const EXALTATION: Partial<Record<Planet, number>> = {
  Sun: 0,
  Moon: 1,
  Mars: 9,
  Mercury: 5,
  Jupiter: 3,
  Venus: 11,
  Saturn: 6,
};
const OWN_SIGNS: Partial<Record<Planet, number[]>> = {
  Sun: [4],
  Moon: [3],
  Mars: [0, 7],
  Mercury: [2, 5],
  Jupiter: [8, 11],
  Venus: [1, 6],
  Saturn: [9, 10],
};

/** +1 exalted or in its own sign, -1 debilitated, 0 otherwise. */
export function dignityOf(planet: Planet, signIndex: number): -1 | 0 | 1 {
  const ex = EXALTATION[planet];
  if (ex === undefined) return 0;
  if (signIndex === ex || OWN_SIGNS[planet]?.includes(signIndex)) return 1;
  if (signIndex === (ex + 6) % 12) return -1;
  return 0;
}

const houseFromAsc = (ascSignIndex: number, signIndex: number) =>
  ((signIndex - ascSignIndex + 12) % 12) + 1;
const signOfHouse = (ascSignIndex: number, house: number) => (ascSignIndex + house - 1) % 12;

/** The chart as seen from (lat, lon): relocated Ascendant, whole-sign houses. */
export async function relocateChart(
  chart: ChartData,
  lat: number,
  lon: number,
): Promise<ChartData> {
  const ascendant = await calculateAscendant(chart.julianDay, lat, lon, chart.ayanamsa);
  return {
    ...chart,
    ascendant,
    planets: chart.planets.map((p) => ({
      ...p,
      house: houseFromAsc(ascendant.signIndex, p.signIndex),
    })),
    houses: Array.from({ length: 12 }, (_, i) => {
      const signIndex = signOfHouse(ascendant.signIndex, i + 1);
      const sign = ZODIAC_SIGNS[signIndex]!;
      return {
        house: i + 1,
        sign,
        signIndex,
        lord: SIGN_LORDS[sign],
        cusp: signIndex * 30,
        planets: chart.planets.filter((p) => p.signIndex === signIndex).map((p) => p.planet),
      };
    }),
  };
}

export interface AreaScore {
  score: number;
  level: 'strong' | 'good' | 'mixed' | 'weak';
  why: WhyFactor[];
}

function levelOf(score: number): AreaScore['level'] {
  if (score >= 70) return 'strong';
  if (score >= 55) return 'good';
  if (score >= 40) return 'mixed';
  return 'weak';
}

function houseScore(
  chart: ChartData,
  sav: number[],
  house: number,
): { score: number; why: WhyFactor[] } {
  const asc = chart.ascendant.signIndex;
  const signIndex = signOfHouse(asc, house);
  const why: WhyFactor[] = [];
  let score = 50;

  const points = sav[signIndex] ?? SAV_AVERAGE;
  score += (points - SAV_AVERAGE) * 3;
  why.push({
    kind: 'house',
    house,
    effect: points > SAV_AVERAGE + 1 ? 1 : points < SAV_AVERAGE - 1 ? -1 : 0,
    textKey: 'relocation.why.sav',
    params: { house, points },
  });

  for (const p of chart.planets) {
    if (p.signIndex !== signIndex) continue;
    const benefic = (NATURAL_BENEFICS as readonly string[]).includes(p.planet);
    const malefic =
      (NATURAL_MALEFICS as readonly string[]).includes(p.planet) ||
      p.planet === 'Rahu' ||
      p.planet === 'Ketu';
    const effect: -1 | 0 | 1 = benefic ? 1 : malefic ? (UPACHAYA.has(house) ? 1 : -1) : 0;
    if (effect === 0) continue;
    score += effect * 8;
    why.push({
      kind: 'house',
      planet: p.planet,
      house,
      effect,
      textKey: 'relocation.why.occupant',
      params: { planet: p.planet, house },
    });
  }

  const lord = SIGN_LORDS[ZODIAC_SIGNS[signIndex]!];
  const lordPos = chart.planets.find((p) => p.planet === lord);
  if (lordPos) {
    const dignity = dignityOf(lord, lordPos.signIndex);
    if (dignity !== 0) {
      score += dignity * 10;
      why.push({
        kind: 'lordship',
        planet: lord,
        house,
        effect: dignity,
        textKey: dignity > 0 ? 'relocation.why.lordStrong' : 'relocation.why.lordWeak',
        params: { planet: lord, house },
      });
    }
  }
  return { score, why };
}

/** Scores the six areas for an (already relocated) chart. */
export function scoreRelocationAreas(chart: ChartData): Record<RelocationArea, AreaScore> {
  const sav = calculateAshtakavarga(chart).sarva.bindus;
  const out = {} as Record<RelocationArea, AreaScore>;
  for (const [area, houses] of Object.entries(RELOCATION_AREAS) as Array<
    [RelocationArea, readonly number[]]
  >) {
    let total = 0;
    let weight = 0;
    const why: WhyFactor[] = [];
    houses.forEach((h, i) => {
      const w = i === 0 ? 2 : 1;
      const hs = houseScore(chart, sav, h);
      total += hs.score * w;
      weight += w;
      why.push(...hs.why);
    });
    const score = Math.round(Math.max(0, Math.min(100, total / weight)));
    out[area] = {
      score,
      level: levelOf(score),
      why: why.filter((f) => f.effect !== 0).slice(0, 4),
    };
  }
  return out;
}
