// =============================================================================
// Deterministic Ashtakoota (Guna Milan) compatibility between two ALREADY-
// PERSISTED kundlis (kundli.chartData for two saved birth_profiles). This is
// an independent module from astro.service.ts#matchmake (the live
// /v1/matchmaking endpoint), which instead computes fresh charts from ad-hoc,
// not-necessarily-saved birth data — that endpoint is untouched by this file.
// =============================================================================

import { calculateAshtakoota } from './matching/ashtakoota.js';
import { detectMangalDosha } from './doshas/mangalDosha.js';

function findPlanet(
  chart: Record<string, unknown> | null,
  name: string,
): Record<string, unknown> | undefined {
  const planets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  return planets.find((p) => p.planet === name);
}

export interface CompatibilityKuta {
  name: string;
  obtained: number;
  maximum: number;
  description: string;
}

export interface CompatibilityFacts {
  totalScore: number;
  maxScore: number;
  compatibility: string;
  kutaDetails: CompatibilityKuta[];
  flags: { nadiDosha: boolean; bhakootDosha: boolean };
  mangalDosha: { person1: boolean; person2: boolean; matched: boolean };
  recommendation: string;
}

/**
 * Deterministic, template-based recommendation built only from the computed
 * Koota scores and dosha flags — never LLM-generated, so it can never invent
 * relationship advice not traceable to the actual analysis. Same logic as
 * astro.service.ts#buildMatchRecommendation, kept as an independent copy
 * rather than a cross-module import so this Prime-only module has zero
 * dependency on the existing /matchmaking endpoint's module.
 */
function buildRecommendation(
  totalScore: number,
  maxTotal: number,
  flags: { nadiDosha: boolean; bhakootDosha: boolean },
  mangalDosha: { person1: boolean; person2: boolean; matched: boolean },
): string {
  const parts: string[] = [];
  const pct = maxTotal > 0 ? (totalScore / maxTotal) * 100 : 0;

  if (flags.nadiDosha) {
    parts.push(
      'Nadi Dosha is present (0/8) — traditionally considered a serious red flag affecting the health of progeny, regardless of the total score.',
    );
  }
  if (flags.bhakootDosha) {
    parts.push(
      "Bhakoot Dosha is present (0/7) — traditionally considered to affect the couple's general relationship, love, and family life.",
    );
  }
  if (!mangalDosha.matched) {
    parts.push(
      "Mangal Dosha is present in only one partner's chart — traditionally this asymmetry is discussed with an astrologer, as a matching Mangal Dosha (present or absent in both) is usually considered more favorable than a mismatch.",
    );
  } else if (mangalDosha.person1) {
    parts.push(
      'Mangal Dosha is present in both charts, which traditional practitioners often consider self-cancelling.',
    );
  }

  if (parts.length === 0) {
    parts.push(
      pct >= 75
        ? 'No Nadi, Bhakoot, or Mangal Dosha mismatch was found, and the overall Guna score is strong.'
        : pct >= 50
          ? 'No Nadi, Bhakoot, or Mangal Dosha mismatch was found, though the overall Guna score is moderate.'
          : 'No Nadi, Bhakoot, or Mangal Dosha mismatch was found, but the overall Guna score is on the lower side.',
    );
  }

  return parts.join(' ');
}

/**
 * Computes the full Ashtakoota + Mangal Dosha match between two persisted
 * charts (kundli.chartData for two saved birth_profiles). Reads each
 * person's Moon nakshatra/sign for the Koota calculation and each person's
 * full chart for the Mangal Dosha check — same math as the live
 * /v1/matchmaking endpoint, applied to STORED charts instead of freshly
 * computed ones.
 */
export function computeCompatibilityFacts(
  chart1: Record<string, unknown> | null,
  chart2: Record<string, unknown> | null,
): CompatibilityFacts {
  const moon1 = findPlanet(chart1, 'Moon');
  const moon2 = findPlanet(chart2, 'Moon');
  const nak1 = Number(moon1?.nakshatraIndex ?? 0);
  const nak2 = Number(moon2?.nakshatraIndex ?? 0);
  const sign1 = String(moon1?.sign ?? 'Aries');
  const sign2 = String(moon2?.sign ?? 'Aries');

  const result = calculateAshtakoota(nak1, nak2, sign1 as any, sign2 as any);

  const nadiScore = result.scores.find((s) => s.koota === 'Nadi');
  const bhakootScore = result.scores.find((s) => s.koota === 'Bhakoot');
  const flags = { nadiDosha: nadiScore?.score === 0, bhakootDosha: bhakootScore?.score === 0 };

  // Default a missing chart to an empty planets list rather than passing
  // null/undefined straight through — detectMangalDosha (and its
  // getPlanetPosition helper) assumes chartData.planets is always at least
  // an array, so a bare null here would throw instead of degrading to "no
  // Mangal Dosha data available" like the Moon/nakshatra fields above do.

  const mangal1 = detectMangalDosha((chart1 ?? { planets: [] }) as any);

  const mangal2 = detectMangalDosha((chart2 ?? { planets: [] }) as any);
  const mangalDosha = {
    person1: mangal1.present,
    person2: mangal2.present,
    matched: mangal1.present === mangal2.present,
  };

  return {
    totalScore: result.totalScore,
    maxScore: result.maxTotal,
    compatibility: result.overallCompatibility,
    kutaDetails: result.scores.map((s) => ({
      name: s.koota,
      obtained: s.score,
      maximum: s.maxScore,
      description: s.description,
    })),
    flags,
    mangalDosha,
    recommendation: buildRecommendation(result.totalScore, result.maxTotal, flags, mangalDosha),
  };
}
