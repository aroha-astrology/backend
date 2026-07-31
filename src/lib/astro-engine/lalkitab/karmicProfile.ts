// =============================================================================
// Lal Kitab Karmic Profile — composes debts.ts + pakkaghar.ts + blindPlanets.ts
// =============================================================================
// Each of these existed as a standalone, tested module with NO caller
// anywhere in the codebase. Ties them together into one profile: which
// ancestral/karmic debts (Rin) are present, which planets sit in their Pakka
// Ghar (permanent house — strong when occupied, per Lal Kitab), and which
// are "blind" (obstructed, per createLalKitabChart's fixed-house convention:
// Aries is always the 1st house for this system's purposes, distinct from
// the natal chart's own Ascendant-based houses used everywhere else in this
// codebase).
// =============================================================================

import { createLalKitabChart } from './chart.js';
import { detectDebts } from './debts.js';
import { analyzePakkaGhar, type PakkaGharResult } from './pakkaghar.js';
import { detectBlindPlanets } from './blindPlanets.js';
import type { ChartData, LalKitabDebt, BlindPlanet } from '@aroha-astrology/shared';

export interface KarmicProfile {
  presentDebts: LalKitabDebt[];
  pakkaGharPlacements: PakkaGharResult[];
  blindPlanets: BlindPlanet[];
}

export function buildKarmicProfile(chartData: ChartData): KarmicProfile {
  const lkChart = createLalKitabChart(chartData);
  const debts = detectDebts(chartData).filter((d) => d.present);
  const pakkaGharPlacements = analyzePakkaGhar(lkChart);
  const blind = detectBlindPlanets(lkChart).filter((p) => p.isBlind || p.isHalfBlind);

  return { presentDebts: debts, pakkaGharPlacements, blindPlanets: blind };
}
