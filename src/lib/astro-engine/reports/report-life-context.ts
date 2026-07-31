// =============================================================================
// Cross-domain life-context — the fix for reports that only look at their own
// domain and miss what's happening everywhere else in the chart at the same
// time.
// =============================================================================
// Root-cause gap this closes: a competitor's Marriage Report told a user
// "your career will have a short-term pause before a strong rebound" — a
// career-domain read woven into a marriage report. Our Marriage Report (and
// every other single-domain report type) had NO 10th-house/career read
// anywhere in its pipeline, so it could never say anything like that, not
// because of a prompt limitation but because the FACT was never computed at
// all.
//
// This module computes ONE shared cross-domain snapshot — current
// Mahadasha/Antardasha, plus a score/tone/nextWindow per life domain — reusing
// primitives every one of the 4 monthly report types and report-timing.ts
// already export. No new astrology math: this is monthly-dasha-context.ts's
// own score/tone formula (computeMonthlyReportScore/toneFromMonthScore),
// applied once per domain instead of once per monthly-report purchase, plus
// report-timing.ts's shared timing-window search for "when does this domain
// next turn favorable."
//
// Pure, synchronous, never throws — same contract as every other report
// astro-engine module (see monthly-dasha-context.ts's own module doc comment
// for why `computeScores` callers can never have this throw on a read path
// with no surrounding try/catch).
// =============================================================================

import type { PlanetAnalysis } from '../gemstones.js';
import { DOMAIN_CONFIG, type Domain } from '../dasha-confidence.js';
import { getHouseLord } from './chart-facts.js';
import {
  computeConnectedHouses,
  computeMonthlyReportScore,
  safelyResolveActivePeriod,
  toneFromMonthScore,
  type MonthlyTone,
} from './monthly-dasha-context.js';
import { computeReportTimingWindows, type RankedWindow } from './report-timing.js';

// Single source of truth for each domain's key houses — the 4 monthly report types (career-
// monthly.ts etc.) import these FROM here (as their own local `KEY_HOUSES`) rather than this
// module importing from them, which would be a circular import (those files also import
// `computeLifeContext` from this module) — ESM circular imports can leave a named export
// `undefined` at the importing module's evaluation time, which is exactly the bug this
// single-direction dependency avoids.
/** 10th house = career/public status, 6th house = daily work/service. */
export const CAREER_KEY_HOUSES = [10, 6];
/** 6th house = ailments/obstacles, 1st house = vitality/the body itself, 8th house =
 * longevity/transformation/chronic or hidden conditions. */
export const HEALTH_KEY_HOUSES = [6, 1, 8];
/** 2nd house = accumulated wealth, 11th house = monthly gains/income. */
export const FINANCE_KEY_HOUSES = [2, 11];
/** 7th house = partnership, 5th house = romance/harmony. */
export const RELATIONSHIP_KEY_HOUSES = [7, 5];

export interface LifeContextDomain {
  domain: 'career' | 'health' | 'wealth' | 'love';
  score: number;
  tone: MonthlyTone;
  connectedHouses: number[];
  nextWindow: RankedWindow | null;
}

export interface LifeContext {
  currentMahadasha: string | null;
  currentAntardasha: string | null;
  /** ISO date — when the current Mahadasha (not the Antardasha) ends. */
  endsOn: string | null;
  domains: LifeContextDomain[];
}

/** Same KEY_HOUSES each monthly report type already scores its own domain against — reused
 * (not re-declared) so a future tuning of one of those constants applies here too. */
const DOMAIN_KEY_HOUSES: Record<LifeContextDomain['domain'], number[]> = {
  career: CAREER_KEY_HOUSES,
  health: HEALTH_KEY_HOUSES,
  wealth: FINANCE_KEY_HOUSES,
  love: RELATIONSHIP_KEY_HOUSES,
};

/** Planets physically occupying a given house — same small local read every report-timing
 * significator-builder in this feature already duplicates (see wealth.ts/true-love.ts's own
 * `occupantsOfHouse`) rather than centralizing, per this feature's established convention. */
function occupantsOfHouse(houseNumber: number, chart: Record<string, unknown> | null): string[] {
  const planets = ((chart?.planets ?? []) as Array<{ planet?: string; house?: number }>) || [];
  return planets
    .filter((p) => p.house === houseNumber && typeof p.planet === 'string')
    .map((p) => p.planet as string);
}

/** Same house-lord + house-occupants + static-karaka merge chat-grounding.ts's own per-domain
 * loop performs, driven by DOMAIN_CONFIG — the SAME table chat's timing answers already read,
 * so a life-context window can never disagree with what chat would say about the same domain. */
function buildDomainSignificators(domain: Domain, chart: Record<string, unknown> | null): string[] {
  const config = DOMAIN_CONFIG[domain];
  const lords = config.natalHouses
    .map((h) => getHouseLord(h, chart))
    .filter((p): p is string => Boolean(p));
  const occupants = config.natalHouses.flatMap((h) => occupantsOfHouse(h, chart));
  return [...new Set([...lords, ...occupants, ...config.staticKarakas])];
}

function currentMonthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function computeDomainContext(
  domain: LifeContextDomain['domain'],
  timingDomain: Domain,
  antardashaLord: string | null,
  chart: Record<string, unknown> | null,
  analyses: PlanetAnalysis[],
  dashaData: Record<string, unknown> | null,
  now: Date,
): LifeContextDomain {
  const keyHouses = DOMAIN_KEY_HOUSES[domain];
  const score = antardashaLord
    ? computeMonthlyReportScore(antardashaLord, keyHouses, chart, analyses)
    : 50;
  const connectedHouses = antardashaLord
    ? computeConnectedHouses(antardashaLord, keyHouses, chart)
    : [];

  const significators = buildDomainSignificators(timingDomain, chart);
  const { windows } = computeReportTimingWindows(
    timingDomain,
    significators,
    dashaData,
    chart,
    now,
  );

  return {
    domain,
    score,
    tone: toneFromMonthScore(score),
    connectedHouses,
    nextWindow: windows[0] ?? null,
  };
}

/**
 * Computes the shared cross-domain snapshot for the CURRENT calendar month (unlike the monthly
 * reports, which score an arbitrary purchased `periodMonth` — life-context always describes
 * "right now," since it's a supplementary read inside a one-time or other-domain report, not the
 * report's own subject). Never throws: a chart missing dasha data degrades to a 50/neutral score
 * per domain and a null Mahadasha/Antardasha, exactly `safelyResolveActivePeriod`'s own contract.
 */
export function computeLifeContext(
  chart: Record<string, unknown> | null,
  analyses: PlanetAnalysis[],
  dashaData: Record<string, unknown> | null,
  now: Date = new Date(),
): LifeContext {
  const period = safelyResolveActivePeriod(chart, currentMonthKey(now));

  const domains: LifeContextDomain[] = [
    computeDomainContext(
      'career',
      'career',
      period?.antardashaLord ?? null,
      chart,
      analyses,
      dashaData,
      now,
    ),
    computeDomainContext(
      'health',
      'health',
      period?.antardashaLord ?? null,
      chart,
      analyses,
      dashaData,
      now,
    ),
    computeDomainContext(
      'wealth',
      'wealth',
      period?.antardashaLord ?? null,
      chart,
      analyses,
      dashaData,
      now,
    ),
    computeDomainContext(
      'love',
      'love',
      period?.antardashaLord ?? null,
      chart,
      analyses,
      dashaData,
      now,
    ),
  ];

  return {
    currentMahadasha: period?.mahadashaLord ?? null,
    currentAntardasha: period?.antardashaLord ?? null,
    endsOn: period ? period.endDate.toISOString().slice(0, 10) : null,
    domains,
  };
}
