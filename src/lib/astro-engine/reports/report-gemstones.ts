// =============================================================================
// Report gemstone recommendations — for the 5 flagship (₹99) report types
// =============================================================================
// Reuses the paid gemstone feature's own deterministic core
// (analyzePlanetStrengths + GEMSTONE_DATA, lib/astro-engine/gemstones.ts)
// wholesale — no new stone table, no new strength/caution logic. This module
// only decides WHICH planets are relevant to a given report type, and adds
// one short, report-specific `role`/`benefit` line per planet explaining WHY
// it matters for that report's own life domain.
//
// Deliberately excludes stone name/finger/metal/day/weight/mantra and the
// full dos/don'ts text — those already live, fully translated into all 7
// languages, in the frontend's `kundli.gemstone.data.<planet>.*` i18n
// resources (the same table the standalone gemstone feature already reads).
// The frontend's report gemstone card looks planets up there directly rather
// than this module re-authoring or duplicating that content.
//
// `role`/`benefit` themselves follow the SAME "backend-authored English
// prose in `scores`, translated via the report's own SCORES_PROSE_ALLOWLIST
// entry" convention this feature already uses for e.g. marriage's
// `seventhLordReason`/`inLaws.note` — see lib/llm/report-scores.ts.
// =============================================================================

import { analyzePlanetStrengths, GEMSTONE_DATA, type PlanetAnalysis } from '../gemstones.js';
import { getHouseLord } from './chart-facts.js';
import type { ReportKey } from '../../../config/reports.js';

export interface ReportGemstone {
  planet: string;
  /** Why this planet's stone is relevant to THIS report's own life domain (e.g. "As your
   * 7th-house lord, this planet directly governs your marriage and partnership house."). */
  role: string;
  /** What wearing this stone is classically said to strengthen, framed for this report's domain. */
  benefit: string;
  strength: PlanetAnalysis['strength'];
  reason: string;
  preference: number;
  /** GEMSTONE_DATA's own hex accent — same color the standalone paid gemstone feature renders
   * with (see gemstone.service.ts's buildDeterministicGems), so the two features' stone visuals
   * never disagree. */
  color: string;
  /** Same per-user, evaluated-fresh predicate the standalone gemstone feature uses — a caution
   * only ever appears when it's actually true for this person's own chart. */
  conditionalCautionApplies: boolean;
}

type PlanetSlot = {
  /** A fixed planet name, or a resolver that reads the relevant house-lord off the chart —
   * skipped entirely (never a guessed fallback) if the lord can't be determined. */
  planet: string | ((chart: Record<string, unknown> | null) => string | undefined);
  role: string;
  benefit: string;
};

const REMEDIES_GENERIC_ROLE: Record<string, { role: string; benefit: string }> = {
  Sun: {
    role: 'Classical significator of vitality, confidence, and authority.',
    benefit: 'Strengthens self-confidence, leadership, and physical vitality.',
  },
  Moon: {
    role: 'Classical significator of the mind, emotions, and inner peace.',
    benefit: 'Supports emotional balance, calm, and mental clarity.',
  },
  Mars: {
    role: 'Classical significator of courage, drive, and energy.',
    benefit: 'Builds courage, stamina, and decisive action.',
  },
  Mercury: {
    role: 'Classical significator of intellect, communication, and commerce.',
    benefit: 'Sharpens communication, analysis, and business acumen.',
  },
  Jupiter: {
    role: 'Classical significator of wisdom, growth, and good fortune.',
    benefit: 'Encourages wisdom, growth, and general good fortune.',
  },
  Venus: {
    role: 'Classical significator of love, harmony, and comfort.',
    benefit: 'Enhances love, harmony, and refined enjoyment of life.',
  },
  Saturn: {
    role: 'Classical significator of discipline, structure, and long-term karma.',
    benefit: 'Builds discipline, patience, and long-term resilience.',
  },
  Rahu: {
    role: 'Classical significator of ambition and unconventional drive.',
    benefit: 'Supports bold ambition and breaking through unconventional obstacles.',
  },
  Ketu: {
    role: 'Classical significator of spirituality and detachment.',
    benefit: 'Deepens spiritual insight and healthy detachment from material anxiety.',
  },
};

/** Per-report planet slots — see this module's doc comment for the reasoning behind each
 * report's own set (marriage: Venus/Jupiter/7th-lord/4th-lord; true_love: Venus/Moon/5th-lord;
 * kundli_milan: Venus/Jupiter/7th-lord; wealth: 2nd-lord/11th-lord/Jupiter/Mercury; remedies:
 * all 9, generic). */
const REPORT_GEMSTONE_SLOTS: Partial<Record<ReportKey, PlanetSlot[]>> = {
  marriage: [
    {
      planet: 'Venus',
      role: 'Venus classically governs romantic harmony, affection, and the ease of your marriage bond.',
      benefit: 'Supports a warmer, more harmonious marriage bond.',
    },
    {
      planet: 'Jupiter',
      role: 'Jupiter is the classical husband/dharma significator used for marriage timing and quality in this report.',
      benefit: 'Supports wisdom, stability, and blessings within the marriage.',
    },
    {
      planet: (chart) => getHouseLord(7, chart),
      role: 'As your 7th-house lord, this planet directly governs the marriage and partnership house itself.',
      benefit: 'Strengthens the partnership house that this report is centered on.',
    },
    {
      planet: (chart) => getHouseLord(4, chart),
      role: 'As your 4th-house lord, this planet governs home, family, and in-law relationships.',
      benefit: 'Supports smoother home life and in-law relationships.',
    },
  ],
  true_love: [
    {
      planet: 'Venus',
      role: "Venus is this report's own primary significator for romance and attraction.",
      benefit: 'Enhances romantic attraction and emotional warmth.',
    },
    {
      planet: 'Moon',
      role: 'The Moon governs the emotional depth this report reads for your romantic archetype.',
      benefit: 'Supports emotional depth and inner romantic contentment.',
    },
    {
      planet: (chart) => getHouseLord(5, chart),
      role: 'As your 5th-house lord, this planet governs romance and self-expression in love.',
      benefit: 'Strengthens romance and creative self-expression in relationships.',
    },
  ],
  kundli_milan: [
    {
      planet: 'Venus',
      role: 'Venus classically governs romantic harmony between the two charts being matched.',
      benefit: 'Supports harmony and affection between both partners.',
    },
    {
      planet: 'Jupiter',
      role: 'Jupiter is the classical significator this report reads for marital blessings.',
      benefit: 'Supports blessings and stability for the match.',
    },
    {
      planet: (chart) => getHouseLord(7, chart),
      role: 'As your 7th-house lord, this planet directly governs your side of the partnership.',
      benefit: 'Strengthens your side of the compatibility this report measures.',
    },
  ],
  wealth: [
    {
      planet: (chart) => getHouseLord(2, chart),
      role: "As your 2nd-house lord, this planet governs accumulated and family wealth — one of this report's two core significators.",
      benefit: 'Supports steady accumulation and financial security.',
    },
    {
      planet: (chart) => getHouseLord(11, chart),
      role: "As your 11th-house lord, this planet governs income and gains — this report's other core significator.",
      benefit: 'Supports gains, income growth, and fulfilled financial goals.',
    },
    {
      planet: 'Jupiter',
      role: 'Jupiter is the classical significator of abundance and financial wisdom this report reads.',
      benefit: 'Supports abundance and sound financial judgment.',
    },
    {
      planet: 'Mercury',
      role: 'Mercury classically governs commerce, trade, and methodical money management.',
      benefit: 'Sharpens financial planning and business acumen.',
    },
  ],
  remedies: (
    ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'] as const
  ).map((planet) => ({
    planet,
    role: REMEDIES_GENERIC_ROLE[planet]!.role,
    benefit: REMEDIES_GENERIC_ROLE[planet]!.benefit,
  })),
};

/** `true` for exactly the 5 flagship report types this feature covers (see this module's doc
 * comment) — every other report type (including baby_name, per an explicit product decision:
 * a gemstone recommendation doesn't fit a baby-naming report) gets no `gemstones` field at all. */
export function reportHasGemstones(reportKey: string): boolean {
  return reportKey in REPORT_GEMSTONE_SLOTS;
}

/**
 * Builds the gemstone list for a report type that has one (see `reportHasGemstones`) — `[]` for
 * any other report key, never throws. Slots whose planet resolver can't determine a lord (chart
 * missing house data) are skipped rather than guessed; a planet resolved by two different slots
 * (e.g. Venus also happening to rule the 7th house) keeps only its FIRST slot's role/benefit text
 * rather than appearing twice.
 */
export function buildReportGemstones(
  reportKey: string,
  chart: Record<string, unknown> | null,
): ReportGemstone[] {
  const slots = REPORT_GEMSTONE_SLOTS[reportKey as ReportKey];
  if (!slots) return [];

  const analyses = analyzePlanetStrengths(chart);
  const seen = new Set<string>();
  const gems: ReportGemstone[] = [];

  for (const slot of slots) {
    const planet = typeof slot.planet === 'function' ? slot.planet(chart) : slot.planet;
    if (!planet || seen.has(planet)) continue;
    const gem = GEMSTONE_DATA[planet];
    if (!gem) continue;
    seen.add(planet);

    const analysis = analyses.find((a) => a.planet === planet);
    gems.push({
      planet,
      role: slot.role,
      benefit: slot.benefit,
      strength: analysis?.strength ?? 'average',
      reason: analysis?.reason ?? 'Reason unavailable.',
      preference: analysis?.preference ?? 50,
      color: gem.color,
      conditionalCautionApplies: gem.conditionalDont?.check(chart) ?? false,
    });
  }

  return gems;
}
