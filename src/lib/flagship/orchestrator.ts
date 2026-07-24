// =============================================================================
// Flagship Life Report orchestrator — assembles the complete report content
// by calling: (a) purely deterministic assemblers (Avkahada Chakra, chart
// summary sections — no AI, no network), (b) 3 ALREADY-BUILT report
// generators reused verbatim (numerology, life-area [career/finance/health/
// love/education], remedies), and (c) 2 NEW small narrative generators built
// specifically for this report (Ascendant Analysis, Executive Summary —
// written last, once everything else exists). The 8 Gemini-calling section
// generators (1 ascendant + 1 numerology + 5 life-area + 1 remedies) run with
// BOUNDED CONCURRENCY (p-limit) rather than all-at-once (rate-limit risk) or
// fully sequential (slow); the Executive Summary runs AFTER that batch
// resolves, not concurrently, so it can reference what the other sections
// actually said.
// =============================================================================

import pLimit from 'p-limit';
import { generateNumerologyReport } from '../llm/numerology-report.js';
import { generateLifeAreaReport } from '../llm/life-area-report.js';
import { generateRemediesReport } from '../llm/remedies-report.js';
import { generateAscendantReport } from '../llm/flagship-ascendant-report.js';
import { generateSummaryReport } from '../llm/flagship-summary-report.js';
import { computeAvkahadaChakra } from '../astro-engine/avkahadaChakra.js';
import {
  buildPlanetPositions,
  buildHouseTable,
  buildYogaList,
  buildDoshaList,
  buildDashaTimeline,
  buildAshtakavargaSummary,
  buildShadbalaSummary,
} from './chartSummary.js';
import type { GroundingSource } from '../chat-grounding.js';
import { getRemedies } from '../../modules/astro/astro.service.js';

export interface FlagshipOrchestratorInput {
  dateOfBirth: string;
  fullName: string;
  gender: string | null;
  grounding: GroundingSource;
  birthData: { date: string; time: string; latitude: number; longitude: number; timezone: string };
}

export interface FlagshipReportContent {
  avkahada: ReturnType<typeof computeAvkahadaChakra>;
  planetPositions: ReturnType<typeof buildPlanetPositions>;
  houseTable: ReturnType<typeof buildHouseTable>;
  yogas: ReturnType<typeof buildYogaList>;
  doshas: ReturnType<typeof buildDoshaList>;
  dashaTimeline: ReturnType<typeof buildDashaTimeline>;
  ashtakavarga: ReturnType<typeof buildAshtakavargaSummary>;
  shadbala: ReturnType<typeof buildShadbalaSummary>;
  ascendant: Awaited<ReturnType<typeof generateAscendantReport>>;
  numerology: Awaited<ReturnType<typeof generateNumerologyReport>>;
  career: Awaited<ReturnType<typeof generateLifeAreaReport>>;
  finance: Awaited<ReturnType<typeof generateLifeAreaReport>>;
  health: Awaited<ReturnType<typeof generateLifeAreaReport>>;
  love: Awaited<ReturnType<typeof generateLifeAreaReport>>;
  education: Awaited<ReturnType<typeof generateLifeAreaReport>>;
  remedies: Awaited<ReturnType<typeof generateRemediesReport>>;
  executiveSummary: Awaited<ReturnType<typeof generateSummaryReport>>;
}

/** Caps how many of the 8 Gemini-calling sections run at once — same bounded-concurrency discipline this codebase already uses elsewhere for bulk LLM calls (e.g. the horoscope batch job). */
const CONCURRENCY_LIMIT = 3;

export async function assembleFlagshipReport(
  input: FlagshipOrchestratorInput,
): Promise<FlagshipReportContent> {
  const chart = input.grounding.chart;

  // --- Deterministic sections (no AI, no network, run synchronously first) ---
  const avkahada = computeAvkahadaChakra(chart);
  const planetPositions = buildPlanetPositions(chart);
  const houseTable = buildHouseTable(chart);
  const yogas = buildYogaList(input.grounding.yogas);
  const doshas = buildDoshaList(input.grounding.doshas);
  const dashaTimeline = buildDashaTimeline(input.grounding.dasha);
  const ashtakavarga = buildAshtakavargaSummary(input.grounding.ashtakavarga);
  const shadbala = buildShadbalaSummary(chart);

  // --- Ascendant Analysis (needs the ascendant + its lord's placement) ---
  const ascendantSign = String(
    (chart?.ascendant as Record<string, unknown> | undefined)?.sign ?? '',
  );
  const firstHouse = houseTable.find((h) => h.house === 1);
  const lordPlanet = firstHouse?.lord ?? '';
  const lordPlacement = planetPositions.find((p) => p.planet === lordPlanet);

  const limit = pLimit(CONCURRENCY_LIMIT);
  const remedies = await getRemedies(input.birthData);

  // --- The 8 Gemini-calling sections, bounded-concurrency ---
  const [ascendant, numerology, career, finance, health, love, education, remediesResult] =
    await Promise.all([
      limit(() =>
        generateAscendantReport({
          ascendantSign,
          lordPlanet,
          lordSign: lordPlacement?.sign ?? '',
          lordHouse: lordPlacement?.house ?? 0,
        }),
      ),
      limit(() =>
        generateNumerologyReport({ dateOfBirth: input.dateOfBirth, fullName: input.fullName }),
      ),
      limit(() => generateLifeAreaReport({ area: 'career', grounding: input.grounding })),
      limit(() => generateLifeAreaReport({ area: 'finance', grounding: input.grounding })),
      limit(() => generateLifeAreaReport({ area: 'health', grounding: input.grounding })),
      limit(() => generateLifeAreaReport({ area: 'love', grounding: input.grounding })),
      limit(() => generateLifeAreaReport({ area: 'education', grounding: input.grounding })),
      limit(() => generateRemediesReport({ remedies })),
    ]);

  // --- Executive Summary — written LAST, digesting every section above ---
  const executiveSummary = await generateSummaryReport({
    sectionDigests: {
      Ascendant: ascendant.intro,
      Numerology: numerology.intro,
      Career: career.intro,
      Finance: finance.intro,
      Health: health.intro,
      Love: love.intro,
      Education: education.intro,
      Remedies: remediesResult.intro,
    },
  });

  return {
    avkahada,
    planetPositions,
    houseTable,
    yogas,
    doshas,
    dashaTimeline,
    ashtakavarga,
    shadbala,
    ascendant,
    numerology,
    career,
    finance,
    health,
    love,
    education,
    remedies: remediesResult,
    executiveSummary,
  };
}
