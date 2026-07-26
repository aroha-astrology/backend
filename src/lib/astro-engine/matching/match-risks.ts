// =============================================================================
// Match risk factors — synastry read across 8 life areas
// =============================================================================
// A good 36-point Guna Milan score only reads the two Moons — it says nothing
// about wealth, health/longevity, career, or timing after marriage. This
// module is a thin synastry layer over the SAME deterministic primitives the
// single-person reports already use (chart-facts.ts, computeWealthScores,
// computeMarriageScores, computeTrueLoveScores) plus the already-computed
// KundliMilanScores (gunaBreakdown/manglikStatus) — it deliberately does not
// re-derive Ashtakoota/Mangal Dosha rules, only combines their outputs with a
// few new house reads (8th/10th/4th/9th) this report needs that no existing
// single-person report computes.
//
// Every area gets a severity ('benefit' | 'neutral' | 'caution' | 'serious')
// and a list of evidence strings — the ONLY facts the LLM narrative layer
// (lib/llm/reports/match-report.ts) is allowed to cite; it must never invent
// a risk beyond what's listed here (same GROUNDING_RULE discipline as
// kundli-milan.ts's narrative prompt).
// =============================================================================

import { analyzePlanetStrengths } from '../gemstones.js';
import {
  getHouseLord,
  isPlanetInHouse,
  strengthOfPlanet,
  strengthScoreOfPlanet,
} from '../reports/chart-facts.js';
import { computeWealthScores } from '../reports/wealth.js';
import { computeMarriageScores } from '../reports/marriage.js';
import { computeTrueLoveScores } from '../reports/true-love.js';
import type { KundliMilanScores } from '../reports/kundli-milan.js';

export type RiskSeverity = 'benefit' | 'neutral' | 'caution' | 'serious';

export const MATCH_RISK_AREA_ORDER = [
  'wealth',
  'health',
  'children',
  'harmony',
  'career',
  'timing',
  'intimacy',
  'inlaws',
] as const;

export type MatchRiskAreaKey = (typeof MATCH_RISK_AREA_ORDER)[number];

export interface MatchRiskFactor {
  key: MatchRiskAreaKey;
  severity: RiskSeverity;
  /** 0-100, the deterministic score this severity was derived from — for transparency, not shown raw to the user. */
  score: number;
  /** Classical justification, e.g. "8th lord Jupiter exalted in Cancer for both charts." The
   * narrative LLM may only cite facts from this list — see GROUNDING_RULE in match-report.ts. */
  evidence: string[];
}

/** score>=70 & no hard flag => benefit; 45-69 & no hard flag => neutral; a hard flag with
 * score>=45 => caution; a hard flag with score<45, or no hard flag but score<45 => the two
 * "genuinely concerning" tiers below neutral (serious only ever reachable via a hard flag,
 * since a low score alone is a mediocre placement, not a classical red flag). */
function severityFromScore(score: number, hardFlag: boolean): RiskSeverity {
  if (hardFlag) return score < 45 ? 'serious' : 'caution';
  if (score >= 70) return 'benefit';
  if (score >= 45) return 'neutral';
  return 'caution';
}

function avg(a: number, b: number): number {
  return Math.round((a + b) / 2);
}

function houseLordScore(house: number, chart: Record<string, unknown> | null): number {
  const analyses = analyzePlanetStrengths(chart);
  const lord = getHouseLord(house, chart);
  return lord ? strengthScoreOfPlanet(lord, analyses) : 60;
}

function houseLordDescription(
  house: number,
  chart: Record<string, unknown> | null,
  label: string,
): string {
  const analyses = analyzePlanetStrengths(chart);
  const lord = getHouseLord(house, chart);
  if (!lord) return `${label}: ${house}th house lord unavailable.`;
  return `${label}: ${house}th lord ${lord} is ${strengthOfPlanet(lord, analyses)}.`;
}

function computeWealthFactor(
  chart1: Record<string, unknown> | null,
  chart2: Record<string, unknown> | null,
): MatchRiskFactor {
  const w1 = computeWealthScores({ chart: chart1 }, null);
  const w2 = computeWealthScores({ chart: chart2 }, null);
  const score = avg(w1.wealthScore, w2.wealthScore);
  return {
    key: 'wealth',
    severity: severityFromScore(score, false),
    score,
    evidence: [
      `Person 1 wealth signifiers (2nd/11th lord + Jupiter): ${w1.wealthPattern}, strength score ${w1.wealthScore}/100.`,
      `Person 2 wealth signifiers (2nd/11th lord + Jupiter): ${w2.wealthPattern}, strength score ${w2.wealthScore}/100.`,
    ],
  };
}

const EIGHTH_HOUSE_MALEFICS = ['Mars', 'Saturn', 'Rahu'] as const;

function computeHealthFactor(
  chart1: Record<string, unknown> | null,
  chart2: Record<string, unknown> | null,
): MatchRiskFactor {
  const score = avg(houseLordScore(8, chart1), houseLordScore(8, chart2));
  const flags1 = EIGHTH_HOUSE_MALEFICS.filter((p) => isPlanetInHouse(p, [8], chart1));
  const flags2 = EIGHTH_HOUSE_MALEFICS.filter((p) => isPlanetInHouse(p, [8], chart2));
  const hardFlag = flags1.length > 0 || flags2.length > 0;

  const evidence = [
    houseLordDescription(8, chart1, 'Person 1 longevity/health house (8th)'),
    houseLordDescription(8, chart2, 'Person 2 longevity/health house (8th)'),
  ];
  if (flags1.length > 0)
    evidence.push(
      `Person 1 has ${flags1.join(', ')} placed in the 8th house — classically a caution for health/accident risk.`,
    );
  if (flags2.length > 0)
    evidence.push(
      `Person 2 has ${flags2.join(', ')} placed in the 8th house — classically a caution for health/accident risk.`,
    );

  // Two independent malefic-in-8th placements (one per person) is a stronger combined signal
  // than either alone — this is the one area where BOTH charts carrying the same hard flag
  // escalates caution to serious, since it's not just a red flag but a doubled one.
  const bothFlagged = flags1.length > 0 && flags2.length > 0;
  return {
    key: 'health',
    severity: bothFlagged ? 'serious' : severityFromScore(score, hardFlag),
    score,
    evidence,
  };
}

function computeChildrenFactor(
  chart1: Record<string, unknown> | null,
  chart2: Record<string, unknown> | null,
): MatchRiskFactor {
  const analyses1 = analyzePlanetStrengths(chart1);
  const analyses2 = analyzePlanetStrengths(chart2);
  const fifth1 = avg(houseLordScore(5, chart1), strengthScoreOfPlanet('Jupiter', analyses1));
  const fifth2 = avg(houseLordScore(5, chart2), strengthScoreOfPlanet('Jupiter', analyses2));
  const score = avg(fifth1, fifth2);
  return {
    key: 'children',
    severity: severityFromScore(score, false),
    score,
    evidence: [
      houseLordDescription(5, chart1, 'Person 1 children house (5th)'),
      houseLordDescription(5, chart2, 'Person 2 children house (5th)'),
      `Jupiter (children/family significator) is ${strengthOfPlanet('Jupiter', analyses1)} for person 1 and ${strengthOfPlanet('Jupiter', analyses2)} for person 2.`,
    ],
  };
}

function computeHarmonyFactor(
  chart1: Record<string, unknown> | null,
  chart2: Record<string, unknown> | null,
  kundliMilan: KundliMilanScores,
): MatchRiskFactor {
  const nadi = kundliMilan.gunaBreakdown.find((k) => k.name === 'Nadi');
  const bhakoot = kundliMilan.gunaBreakdown.find((k) => k.name === 'Bhakoot');
  const gana = kundliMilan.gunaBreakdown.find((k) => k.name === 'Gana');
  const manglikMismatch =
    kundliMilan.manglikStatus.person1 !== kundliMilan.manglikStatus.person2 &&
    !kundliMilan.manglikStatus.cancelled;

  const score = Math.round((kundliMilan.gunaMilanScore / kundliMilan.gunaMaxScore) * 100);
  const hardFlag = nadi?.score === 0 || bhakoot?.score === 0 || manglikMismatch;

  const evidence = [
    `Guna Milan total: ${kundliMilan.gunaMilanScore}/${kundliMilan.gunaMaxScore} (${kundliMilan.compatibilityBand}).`,
  ];
  if (nadi) evidence.push(`Nadi koota: ${nadi.score}/${nadi.maxScore}.`);
  if (bhakoot) evidence.push(`Bhakoot koota: ${bhakoot.score}/${bhakoot.maxScore}.`);
  if (gana) evidence.push(`Gana koota: ${gana.score}/${gana.maxScore}.`);
  if (manglikMismatch)
    evidence.push(
      'Mangal Dosha status is mismatched between the two charts (present in only one, uncancelled).',
    );

  return {
    key: 'harmony',
    severity: hardFlag ? severityFromScore(score, true) : severityFromScore(score, false),
    score,
    evidence,
  };
}

function computeCareerFactor(
  chart1: Record<string, unknown> | null,
  chart2: Record<string, unknown> | null,
): MatchRiskFactor {
  const p1 = avg(houseLordScore(10, chart1), houseLordScore(6, chart1));
  const p2 = avg(houseLordScore(10, chart2), houseLordScore(6, chart2));
  const score = avg(p1, p2);
  return {
    key: 'career',
    severity: severityFromScore(score, false),
    score,
    evidence: [
      houseLordDescription(10, chart1, 'Person 1 career house (10th)'),
      houseLordDescription(10, chart2, 'Person 2 career house (10th)'),
    ],
  };
}

function computeTimingFactor(chart1: Record<string, unknown> | null): MatchRiskFactor {
  const marriage = computeMarriageScores({ chart: chart1 }, null);
  const evidence: string[] = [];
  let severity: RiskSeverity;
  let score: number;

  if (!marriage.strongestWindow) {
    severity = 'caution';
    score = 40;
    evidence.push(
      'No clearly favorable Mahadasha/Antardasha window for marriage was found for person 1 within the next 15 years — timing is less classically clear-cut, not necessarily unfavorable.',
    );
  } else {
    const yearsAway =
      (new Date(marriage.strongestWindow.startDate).getTime() - Date.now()) / (365.25 * 86_400_000);
    if (yearsAway <= 3) {
      severity = 'benefit';
      score = 80;
    } else {
      severity = 'neutral';
      score = 55;
    }
    evidence.push(
      `Person 1's most favorable marriage-timing window (7th lord/Venus/Jupiter dasha) runs from ${marriage.strongestWindow.startDate.slice(0, 10)} to ${marriage.strongestWindow.endDate.slice(0, 10)}.`,
    );
  }

  return { key: 'timing', severity, score, evidence };
}

function computeIntimacyFactor(
  chart1: Record<string, unknown> | null,
  chart2: Record<string, unknown> | null,
): MatchRiskFactor {
  const t1 = computeTrueLoveScores({ chart: chart1 }, null);
  const t2 = computeTrueLoveScores({ chart: chart2 }, null);
  const score = avg(t1.partnershipScore, t2.partnershipScore);
  return {
    key: 'intimacy',
    severity: severityFromScore(score, false),
    score,
    evidence: [
      `Person 1 partnership/Venus signifiers score ${t1.partnershipScore}/100.`,
      `Person 2 partnership/Venus signifiers score ${t2.partnershipScore}/100.`,
    ],
  };
}

function computeInlawsFactor(
  chart1: Record<string, unknown> | null,
  chart2: Record<string, unknown> | null,
): MatchRiskFactor {
  const p1 = avg(houseLordScore(4, chart1), houseLordScore(9, chart1));
  const p2 = avg(houseLordScore(4, chart2), houseLordScore(9, chart2));
  const score = avg(p1, p2);
  return {
    key: 'inlaws',
    severity: severityFromScore(score, false),
    score,
    evidence: [
      houseLordDescription(4, chart1, 'Person 1 home/family house (4th)'),
      houseLordDescription(9, chart1, 'Person 1 extended-family/dharma house (9th)'),
      houseLordDescription(4, chart2, 'Person 2 home/family house (4th)'),
      houseLordDescription(9, chart2, 'Person 2 extended-family/dharma house (9th)'),
    ],
  };
}

/**
 * `chart1`/`chart2` are `kundli.chartData`-shaped (see ReportScoreContext); `kundliMilan` is the
 * already-computed Ashtakoota/Manglik result for this same pair — passed in rather than
 * recomputed so this module never re-derives Ashtakoota/Mangal Dosha rules itself.
 */
export function computeMatchRiskFactors(
  chart1: Record<string, unknown> | null,
  chart2: Record<string, unknown> | null,
  kundliMilan: KundliMilanScores,
): MatchRiskFactor[] {
  return [
    computeWealthFactor(chart1, chart2),
    computeHealthFactor(chart1, chart2),
    computeChildrenFactor(chart1, chart2),
    computeHarmonyFactor(chart1, chart2, kundliMilan),
    computeCareerFactor(chart1, chart2),
    computeTimingFactor(chart1),
    computeIntimacyFactor(chart1, chart2),
    computeInlawsFactor(chart1, chart2),
  ];
}
