// =============================================================================
// Marriage report — spouse synastry (optional, only when the purchaser supplied
// real spouse birth details — see config/reports.ts's acceptsOptionalPartner).
// =============================================================================
// Deliberately reuses the SAME Ashtakoota/Dashakoota/Mangal-Dosha/risk-factor
// functions kundli-milan.ts already calls, rather than a second implementation
// — two independent Guna Milan calculators for the same couple would risk
// silently disagreeing. Pure, synchronous — no LLM call, no DB access, same
// contract as computeMarriageScores/computeKundliMilanScores.
// =============================================================================

import { calculateAshtakoota } from '../matching/ashtakoota.js';
import { calculateDashakoota } from '../matching/dashakoota.js';
import { detectMangalDosha } from '../doshas/mangalDosha.js';
import { computeMatchRiskFactors, type MatchRiskFactor } from '../matching/match-risks.js';
import { computeReportVargas, type ReportVarga } from './report-vargas.js';
import {
  getMoonPlacement,
  compatibilityBandFromGunaScore,
  type CompatibilityBand,
  type KootaBreakdownEntry,
  type KundliMilanScores,
} from './kundli-milan.js';

export interface SpouseSynastry {
  gunaMilanScore: number;
  gunaMaxScore: number;
  gunaBreakdown: KootaBreakdownEntry[];
  compatibilityBand: CompatibilityBand;
  dashakootaScore: number;
  dashakootaMaxScore: number;
  dashakootaCompatibility: ReturnType<typeof calculateDashakoota>['overallCompatibility'];
  manglikStatus: { self: boolean; spouse: boolean; cancelled: boolean };
  /** Same 8 life-area synastry read (wealth/health/children/harmony/career/timing/intimacy/
   * inlaws) kundli_milan/match_report already use — see match-risks.ts. */
  riskFactors: MatchRiskFactor[];
  /** The spouse's own Navamsa (D9) — `[]` if it can't be computed from the given chart. */
  spouseNavamsa: ReportVarga[];
}

/**
 * `selfChart` is the marriage-report purchaser's own chart (`ctx.chart`); `spouseChart` is
 * `ctx.partnerChart`, computed fresh from the purchaser-supplied birth details (see
 * reports.service.ts's `hasPartnerBirthInput`/`partnerInputToBirthRecord`). Returns `null`
 * when either chart is missing — i.e. for every marriage report generated without spouse data,
 * which must keep behaving exactly as it did before this feature existed.
 */
export function computeSpouseSynastry(
  selfChart: Record<string, unknown> | null,
  spouseChart: Record<string, unknown> | null,
  dashaData: Record<string, unknown> | null,
): SpouseSynastry | null {
  if (!selfChart || !spouseChart) return null;

  const moonSelf = getMoonPlacement(selfChart);
  const moonSpouse = getMoonPlacement(spouseChart);

  const ashtakoota = calculateAshtakoota(
    moonSelf.nakshatraIndex,
    moonSpouse.nakshatraIndex,
    moonSelf.sign,
    moonSpouse.sign,
  );
  const dashakoota = calculateDashakoota(
    moonSelf.nakshatraIndex,
    moonSpouse.nakshatraIndex,
    moonSelf.sign,
    moonSpouse.sign,
  );

  // detectMangalDosha's declared parameter is the stricter `ChartData` shape — same defensive
  // cast kundli-milan.ts's computeKundliMilanScores uses around this same call.
  const mangalSelf = detectMangalDosha(
    selfChart as unknown as Parameters<typeof detectMangalDosha>[0],
  );
  const mangalSpouse = detectMangalDosha(
    spouseChart as unknown as Parameters<typeof detectMangalDosha>[0],
  );
  const cancelled = mangalSelf.type === 'cancelled' || mangalSpouse.type === 'cancelled';

  const gunaBreakdown: KootaBreakdownEntry[] = ashtakoota.scores.map((s) => ({
    name: s.koota,
    score: s.score,
    maxScore: s.maxScore,
    description: s.description,
  }));
  const compatibilityBand = compatibilityBandFromGunaScore(ashtakoota.totalScore);

  // computeMatchRiskFactors reads exactly these 5 fields off its 3rd param (see its
  // computeHarmonyFactor helper) — person1/person2 naming here is required by that function's
  // own contract, kept internal to this call only; the public SpouseSynastry.manglikStatus below
  // uses the friendlier self/spouse naming for the narrative layer.
  const riskFactorInput = {
    gunaMilanScore: ashtakoota.totalScore,
    gunaMaxScore: ashtakoota.maxTotal,
    gunaBreakdown,
    manglikStatus: { person1: mangalSelf.present, person2: mangalSpouse.present, cancelled },
    compatibilityBand,
  } as unknown as KundliMilanScores;

  const riskFactors = computeMatchRiskFactors(selfChart, spouseChart, riskFactorInput, dashaData);

  return {
    gunaMilanScore: ashtakoota.totalScore,
    gunaMaxScore: ashtakoota.maxTotal,
    gunaBreakdown,
    compatibilityBand,
    dashakootaScore: dashakoota.totalScore,
    dashakootaMaxScore: dashakoota.maxTotal,
    dashakootaCompatibility: dashakoota.overallCompatibility,
    manglikStatus: { self: mangalSelf.present, spouse: mangalSpouse.present, cancelled },
    riskFactors,
    spouseNavamsa: computeReportVargas(spouseChart, ['D9']),
  };
}
