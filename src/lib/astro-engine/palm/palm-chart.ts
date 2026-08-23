// =============================================================================
// Palm <-> birth-chart reconciliation
// =============================================================================
// The palm reading used to score six life domains purely from what the hand
// showed, while the Wealth / Marriage / Career reports scored the SAME domains
// from the chart. Nothing tied the two together, so the app could tell one user
// "marriage 3/10" on the palm screen and the opposite on the report screen.
//
// This module closes that by computing the chart's own view of those domains
// with the exact primitives the paid reports already use (analyzePlanetStrengths
// from gemstones.ts, plus getHouseLord/strengthScoreOfPlanet from
// reports/chart-facts.ts). Same inputs, same helpers, same numbers — so palm
// scores are clamped to a band around the chart's rather than left free to
// contradict it (see clampToChart).
//
// It also emits mount-vs-planet agreement as PalmRuleFacts, deliberately in the
// SAME shape and with the same posture as palm-rules.ts's existing CV
// cross-check: corroboration is named as high-confidence, disagreement is named
// honestly rather than silently resolved in favour of either side.
// =============================================================================

import { analyzePlanetStrengths, type PlanetAnalysis } from '../gemstones.js';
import { getHouseLord, strengthScoreOfPlanet } from '../reports/chart-facts.js';
import type { PalmRuleFact } from './palm-rules.js';
import type { PalmHandObservations, PalmMounts } from './palm-types.js';

export interface PalmDomainScores {
  career: number;
  wealth: number;
  marriage: number;
  health: number;
  fame: number;
  spiritualGrowth: number;
}

export type PalmDomain = keyof PalmDomainScores;

function avg(values: number[]): number {
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

/** A house's lord's strength, or the neutral 60 when the chart has no house data — the same
 * fallback `houseLordScore` uses in match-risks.ts, kept identical on purpose. */
function houseLordScore(
  house: number,
  chart: Record<string, unknown> | null,
  analyses: PlanetAnalysis[],
): number {
  const lord = getHouseLord(house, chart);
  return lord ? strengthScoreOfPlanet(lord, analyses) : 60;
}

/**
 * The chart's own 0-10 verdict on each of the six domains the palm reading scores.
 *
 * Significator choices follow the same house-lord + karaka averaging the report generators use
 * (see wealth.ts's 2nd/11th/Jupiter blend and match-risks.ts's 5th/Jupiter blend) rather than a
 * new scheme, so a user comparing the palm screen to the Wealth report sees numbers derived the
 * same way. Returns null for a chart with no usable planet data — the caller must then leave the
 * palm's own scores alone rather than clamp against a fabricated baseline.
 */
export function chartDomainScores(chart: Record<string, unknown> | null): PalmDomainScores | null {
  const planets = chart?.planets;
  if (!Array.isArray(planets) || planets.length === 0) return null;

  const a = analyzePlanetStrengths(chart);
  const to10 = (score100: number) => Math.round(Math.max(0, Math.min(100, score100)) / 10);

  return {
    career: to10(avg([houseLordScore(10, chart, a), strengthScoreOfPlanet('Saturn', a)])),
    wealth: to10(
      avg([
        houseLordScore(2, chart, a),
        houseLordScore(11, chart, a),
        strengthScoreOfPlanet('Jupiter', a),
      ]),
    ),
    marriage: to10(avg([houseLordScore(7, chart, a), strengthScoreOfPlanet('Venus', a)])),
    health: to10(
      avg([
        houseLordScore(1, chart, a),
        strengthScoreOfPlanet('Sun', a),
        houseLordScore(6, chart, a),
      ]),
    ),
    fame: to10(avg([houseLordScore(10, chart, a), strengthScoreOfPlanet('Sun', a)])),
    spiritualGrowth: to10(
      avg([
        houseLordScore(9, chart, a),
        houseLordScore(12, chart, a),
        strengthScoreOfPlanet('Jupiter', a),
      ]),
    ),
  };
}

/**
 * How far a palm-derived score may sit from the chart's own. Two points on a 0-10 scale is wide
 * enough for the hand to genuinely shade the reading (a strong Mount of Venus can lift a
 * middling 7th house from 5 to 7) but never wide enough to invert it — which is exactly the
 * contradiction this exists to prevent. Deliberately a constant, not a config value: it is a
 * product decision about how much the two systems may disagree, not a tunable.
 */
export const CHART_ANCHOR_TOLERANCE = 2;

/** Clamps the LLM's palm scores into `±CHART_ANCHOR_TOLERANCE` of the chart's. A null chart
 * baseline (no usable chart) passes the palm scores through untouched — better an unanchored
 * reading than one anchored to a made-up number. */
export function clampToChart<T extends PalmDomainScores>(
  palm: T,
  chart: PalmDomainScores | null,
): T {
  if (!chart) return palm;
  const out = { ...palm };
  for (const domain of Object.keys(chart) as PalmDomain[]) {
    const floor = Math.max(0, chart[domain] - CHART_ANCHOR_TOLERANCE);
    const ceil = Math.min(10, chart[domain] + CHART_ANCHOR_TOLERANCE);
    out[domain] = Math.max(floor, Math.min(ceil, palm[domain]));
  }
  return out;
}

/** Which Navagraha each mount answers to. The palm and the chart are two readings of the same
 * nine planetary principles — this map is what makes them comparable at all. */
const MOUNT_PLANET: Record<keyof PalmMounts, string> = {
  jupiter: 'Jupiter',
  saturn: 'Saturn',
  apollo: 'Sun',
  mercury: 'Mercury',
  venus: 'Venus',
  luna: 'Moon',
  marsUpper: 'Mars',
  marsLower: 'Mars',
  rahuPlain: 'Rahu',
};

const MOUNT_LABEL: Record<keyof PalmMounts, string> = {
  jupiter: 'Jupiter (Guru)',
  saturn: 'Saturn (Shani)',
  apollo: 'Apollo/Sun (Surya)',
  mercury: 'Mercury (Budha)',
  venus: 'Venus (Shukra)',
  luna: 'Luna/Moon (Chandra)',
  marsUpper: 'Upper Mars',
  marsLower: 'Lower Mars',
  rahuPlain: 'Plain of Mars (Rahu)',
};

/**
 * Mount-by-mount agreement between the hand and the birth chart, as grounding facts.
 *
 * Only mounts the vision pass committed to (flat or prominent) are compared — there is nothing
 * to corroborate or contradict against a "normal" rating, the same rule palm-rules.ts applies to
 * its CV cross-check. An 'average' planet is likewise treated as no signal.
 *
 * Deterministic, pure, no I/O. Returns [] when the chart is unusable.
 */
export function crossCheckPalmAgainstChart(
  hand: PalmHandObservations,
  chart: Record<string, unknown> | null,
): PalmRuleFact[] {
  const planets = chart?.planets;
  if (!Array.isArray(planets) || planets.length === 0) return [];

  const analyses = analyzePlanetStrengths(chart);
  const facts: PalmRuleFact[] = [];

  for (const key of Object.keys(hand.mounts) as Array<keyof PalmMounts>) {
    const development = hand.mounts[key];
    if (development === 'normal') continue;

    const planet = MOUNT_PLANET[key];
    const analysis = analyses.find((entry) => entry.planet === planet);
    if (!analysis || analysis.strength === 'average') continue;

    const label = MOUNT_LABEL[key];
    const agrees =
      (development === 'prominent' && analysis.strength === 'strong') ||
      (development === 'flat' && analysis.strength === 'weak');

    if (agrees) {
      facts.push({
        key: `chart.mount.${key}.corroborated`,
        evidence: `Mount of ${label} is ${development} on the hand, and ${planet} is ${analysis.strength} in the birth chart (${analysis.reason}).`,
        meaning: `The hand and the birth chart independently agree about ${planet}. Say so explicitly — this is the most credible kind of statement this reading can make, and it should be presented as agreement between two separate systems, not as one more palm observation.`,
        source: 'Palm/chart cross-validation',
      });
    } else {
      facts.push({
        key: `chart.mount.${key}.conflict`,
        evidence: `Mount of ${label} is ${development} on the hand, but ${planet} is ${analysis.strength} in the birth chart (${analysis.reason}).`,
        meaning: `The hand and the chart disagree about ${planet}. Name the disagreement plainly rather than picking a side or quietly dropping one of them — classically the hand shows what has been made of the chart's inheritance, so a strong mount over a weak planet reads as effort outrunning the birth promise, and the reverse as unused potential.`,
        source: 'Palm/chart cross-validation',
      });
    }
  }

  return facts;
}
