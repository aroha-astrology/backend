// =============================================================================
// Shared final-verdict summary — one generic closing card for every report type
// =============================================================================
// Every report type already computes a rich `scores` JSON of deterministic,
// grounded facts (score/band/timing/archetype/etc. — shape differs per report
// type, same discipline report-score-facts.ts's generic renderer already
// relies on). This module turns that JSON into one short headline, a handful
// of plain-language takeaway bullets, and a single next step — generation-time
// only (one Gemini call per report, persisted, never re-run on read), mirroring
// window-summary.ts's own generation-time-only, persist-and-splice contract
// exactly. One shared prompt for all 14 report types — no per-type prompt
// file — since it only needs to read whatever facts are already in `scores`.
// =============================================================================

import { generate } from '../gemini-client.js';
import { REPORT_PROFILE } from '../../../config/llm.js';
import { cleanJsonString } from '../horoscope.js';
import { reportFactsMessage } from './report-facts-message.js';
import type { ReportKey } from '../../../config/reports.js';

const GROUNDING_RULE =
  'Every fact in the JSON below was already computed by a deterministic classical Vedic algorithm. Never invent a new number, date, or fact not present in the JSON — only summarize and prioritize what is already there.';
const SAFETY_RULE =
  'This is advisory guidance for reflection, never a guarantee about what will happen, and never a substitute for the reader\'s own judgment and choices. Use tendency language ("suggests", "tends to"), never absolute predictions.';

/**
 * What each report type's Final Verdict is ABOUT — injected as a hard topic constraint so
 * the model can't reach for the loudest fact in the JSON instead of the report's own
 * subject. Every report's `scores` carries `lifeContext` (a cross-domain career/health/
 * wealth/love read with its own timing window, via `ReportSharedFacts` — see that
 * interface's doc comment) purely as narrative grounding, not as this report's topic; left
 * unconstrained, the model would happily write career/wealth bullets — with that SAME
 * lifeContext timing window — on a Baby Name or Health report. See VERDICT_EXCLUDED_KEYS
 * below for the other half of this fix (removing lifeContext from the JSON entirely).
 *
 * One entry per REPORT_CATALOGUE key — report-generator-registry.spec.ts-style coverage
 * test in verdict.spec.ts asserts this map has no gaps, so a newly added report type fails
 * loudly instead of silently getting a generic, possibly off-topic verdict.
 */
export const VERDICT_TOPIC: Record<ReportKey, string> = {
  marriage: "the reader's marriage prospects, timing, and future spouse/in-laws",
  past_life: "the reader's past-life karmic axis (Rahu/Ketu) and what it explains about this life",
  kundli_milan:
    'the compatibility between the reader and the specific partner they matched against',
  true_love: "the reader's romantic/love life, partner archetype, and relationship timing",
  wealth: "the reader's money, income, and wealth-building patterns",
  baby_name:
    "naming a child — the suggested names/spelling and their numerological fit, NOT the reader's own career or finances",
  health_monthly: "the reader's physical/mental health and wellbeing this specific month",
  career_monthly: "the reader's work, career moves, and professional life this specific month",
  finance_monthly: "the reader's money and finances this specific month",
  relationship_monthly: "the reader's relationships and romantic life this specific month",
  match_report:
    'the compatibility risk/benefit areas between the reader and the specific partner they matched against',
  numerology:
    "the reader's core numerology numbers (Mulank, Bhagyank, Life Path, etc.) and what they reveal about personality and life pattern",
  name_change:
    "whether the reader's current name is numerologically aligned, and the suggested spelling/name changes",
  remedies: "the reader's Lal Kitab remedies — karmic debts, blind planets, and planet placements",
};

/** `lifeContext` and `planetCondition` are cross-domain grounding attached to EVERY report
 * type by `ReportSharedFacts` (see that interface's doc comment) — narrative color, not this
 * report's own topic. Left in the JSON, the verdict model reliably latches onto
 * `lifeContext`'s career/wealth domains and its `nextWindow` regardless of what the report
 * is actually about (the bug this map + this exclusion list fixes). `vargas`/
 * `ashtakavargaSummary`/`userAnswers` are the same "grounding, not a fact to summarize"
 * category the frontend already excludes from its own generic facts grid (see
 * SEPARATELY_RENDERED_KEYS in report-score-facts.ts) — excluded here for the same reason,
 * one level earlier, so the model never sees them at all. */
const VERDICT_EXCLUDED_KEYS = new Set([
  'lifeContext',
  'planetCondition',
  'vargas',
  'partnerVargas',
  'ashtakavargaSummary',
  'userAnswers',
]);

export function factsForVerdict(scores: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(scores).filter(([k]) => !VERDICT_EXCLUDED_KEYS.has(k)));
}

/** A yearly report's [start, end) validity window (see reports.service.ts's `YearWindow`,
 * duplicated here as a plain interface so this module stays free of a reports.service.ts
 * import — the two are structurally identical by construction, not independently derived). */
export interface VerdictYearWindow {
  start: string; // 'YYYY-MM-DD'
  end: string; // 'YYYY-MM-DD', exclusive
}

function systemPrompt(reportKey: ReportKey, yearWindow: VerdictYearWindow | null): string {
  const topic = VERDICT_TOPIC[reportKey];
  // Reinforcement, not the actual guarantee: every timing-window fact in the JSON given below
  // was ALREADY clamped to this same window before this prompt was built (see
  // reports.service.ts's clampWindowsToYear) — the model literally cannot see a date outside
  // it. This line just keeps the model's own prose framing honest about the report's scope.
  const yearScopeLine = yearWindow
    ? `\nThis report covers the 12 months from ${yearWindow.start} to ${yearWindow.end}. Every timing claim must fall inside that window.\n`
    : '';
  return `You are writing the closing "Final Verdict" card for a paid Vedic astrology report in a mobile app. This report is specifically about ${topic}. You are given the report's own deterministic facts as JSON.
${yearScopeLine}
${GROUNDING_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"headline": string, "bullets": string[], "nextStep": string}

- "headline": one warm, encouraging sentence (under 100 characters) that captures the single most important takeaway from the facts given.
- "bullets": EXACTLY 5 short plain-language takeaways (each under 140 characters), each grounded in a DIFFERENT fact from the JSON given — prioritize the most decision-relevant facts (scores, timing, cautions) over minor ones.
- "nextStep": ONE single, concrete, low-effort next action the reader could take this week (under 140 characters) — never a purchase or a specific remedy/product recommendation.

Every headline, bullet, and next step MUST stay about ${topic} — this report's own subject. Never drift into a different life area (e.g. career or money) unless that IS this report's subject.

Second person ("you"). Never use words like "Yogini", "Vimshottari", "Antardasha", "Pratyantardasha", "dasha", or "transit" — write for a reader with no astrology background.`;
}

export interface ReportVerdict {
  headline: string;
  bullets: string[];
  nextStep: string;
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    bullets: { type: 'array', items: { type: 'string' } },
    nextStep: { type: 'string' },
  },
  required: ['headline', 'bullets', 'nextStep'],
} as const;

/**
 * One bounded Gemini call, given the report's OWN `scores` JSON as reference data —
 * `reportKey` both selects the topic constraint (VERDICT_TOPIC) and, via `factsForVerdict`,
 * strips the cross-domain grounding fields (VERDICT_EXCLUDED_KEYS) that otherwise pull every
 * report's verdict toward the same career/wealth/timing bullets regardless of what the
 * report is actually about. Throws on unparseable JSON or fewer than 3 bullets — same
 * discipline as `summarizeTimingWindows`: the caller (reports.service.ts) catches this, logs
 * it, and persists no verdict rather than blocking the whole report on a non-essential
 * enrichment.
 */
export async function generateReportVerdict(
  scores: Record<string, unknown>,
  reportKey: ReportKey,
  yearWindow: VerdictYearWindow | null = null,
): Promise<ReportVerdict> {
  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: VERDICT_SCHEMA,
    messages: [
      { role: 'system', content: systemPrompt(reportKey, yearWindow) },
      // No explicit condition argument: `planetCondition` is one of the excluded keys
      // above (it's grounding, not this report's topic) — passing it again would just
      // reintroduce the cross-domain drift this function exists to remove.
      reportFactsMessage(JSON.stringify(factsForVerdict(scores))),
      { role: 'user', content: 'Write the Final Verdict card for this report.' },
    ],
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJsonString(raw));
  } catch {
    throw new Error('report verdict LLM returned unparseable JSON');
  }

  const v = parsed as Partial<ReportVerdict> | null;
  if (
    !v ||
    typeof v.headline !== 'string' ||
    !v.headline.trim() ||
    !Array.isArray(v.bullets) ||
    v.bullets.length < 3 ||
    !v.bullets.every((b) => typeof b === 'string' && b.trim()) ||
    typeof v.nextStep !== 'string' ||
    !v.nextStep.trim()
  ) {
    throw new Error('report verdict LLM returned a malformed shape');
  }

  return { headline: v.headline, bullets: v.bullets, nextStep: v.nextStep };
}

/** Translates an already-generated verdict — one call, same idiom as `translateMarriageNarrative`
 * etc. Throws on unparseable JSON or a missing field; the caller falls back to the English
 * verdict rather than caching a corrupted translation. */
export async function translateReportVerdict(
  verdict: ReportVerdict,
  targetLanguage: string,
): Promise<ReportVerdict> {
  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: VERDICT_SCHEMA,
    messages: [
      {
        role: 'user',
        content: `Translate the following report verdict into the language "${targetLanguage}". Keep the exact same JSON structure ({"headline": string, "bullets": string[], "nextStep": string}) and the same number of bullets. ONLY translate the human-readable text.\n\nOriginal Content:\n${JSON.stringify(verdict, null, 2)}`,
      },
    ],
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJsonString(raw));
  } catch {
    throw new Error(
      `report verdict translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }

  const v = parsed as Partial<ReportVerdict> | null;
  if (
    !v ||
    typeof v.headline !== 'string' ||
    !v.headline.trim() ||
    !Array.isArray(v.bullets) ||
    v.bullets.length !== verdict.bullets.length ||
    !v.bullets.every((b) => typeof b === 'string' && b.trim()) ||
    typeof v.nextStep !== 'string' ||
    !v.nextStep.trim()
  ) {
    throw new Error(
      `report verdict translation returned a malformed shape (target=${targetLanguage})`,
    );
  }

  return { headline: v.headline, bullets: v.bullets, nextStep: v.nextStep };
}
