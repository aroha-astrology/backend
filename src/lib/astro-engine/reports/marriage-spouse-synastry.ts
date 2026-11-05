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

import { calculateAshtakootaForPair } from '../matching/ashtakoota.js';
import { calculateDashakootaForPair } from '../matching/dashakoota.js';
import { manglikPairStatus } from './manglik-status.js';
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
  dashakootaCompatibility: ReturnType<typeof calculateDashakootaForPair>['overallCompatibility'];
  /** `self`/`spouse` are EFFECTIVE status (Mangal Dosha found and not cancelled); `cancelled` is
   * the either-person flag, and the per-person fields say whose dosha cancelled and why. */
  manglikStatus: {
    self: boolean;
    spouse: boolean;
    cancelled: boolean;
    cancelledSelf?: boolean;
    cancelledSpouse?: boolean;
    reasonsSelf?: string[];
    reasonsSpouse?: string[];
  };
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
  selfGender?: string | null,
  spouseGender?: string | null,
): SpouseSynastry | null {
  if (!selfChart || !spouseChart) return null;

  const moonSelf = getMoonPlacement(selfChart);
  const moonSpouse = getMoonPlacement(spouseChart);
  if (!moonSelf || !moonSpouse) return null;

  const ashtakoota = calculateAshtakootaForPair(moonSelf, moonSpouse, selfGender, spouseGender);
  const dashakoota = calculateDashakootaForPair(moonSelf, moonSpouse, selfGender, spouseGender);

  // Each person's own effective status (found and not cancelled) and cancellation reasons: the same
  // helper Kundli Milan uses (audit Sprint 5, SB1/SB2).
  const manglik = manglikPairStatus(selfChart, spouseChart);

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
    manglikStatus: manglik,
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
    manglikStatus: {
      self: manglik.person1,
      spouse: manglik.person2,
      cancelled: manglik.cancelled,
      cancelledSelf: manglik.cancelled1,
      cancelledSpouse: manglik.cancelled2,
      reasonsSelf: manglik.reasons1,
      reasonsSpouse: manglik.reasons2,
    },
    riskFactors,
    spouseNavamsa: computeReportVargas(spouseChart, ['D9']),
  };
}
