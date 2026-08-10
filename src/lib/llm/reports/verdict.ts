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

const GROUNDING_RULE =
  'Every fact in the JSON below was already computed by a deterministic classical Vedic algorithm. Never invent a new number, date, or fact not present in the JSON — only summarize and prioritize what is already there.';
const SAFETY_RULE =
  'This is advisory guidance for reflection, never a guarantee about what will happen, and never a substitute for the reader\'s own judgment and choices. Use tendency language ("suggests", "tends to"), never absolute predictions.';

function systemPrompt(): string {
  return `You are writing the closing "Final Verdict" card for a paid Vedic astrology report in a mobile app. You are given the report's full deterministic facts as JSON.

${GROUNDING_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"headline": string, "bullets": string[], "nextStep": string}

- "headline": one warm, encouraging sentence (under 100 characters) that captures the single most important takeaway from the facts given.
- "bullets": EXACTLY 5 short plain-language takeaways (each under 140 characters), each grounded in a DIFFERENT fact from the JSON given — prioritize the most decision-relevant facts (scores, timing, cautions) over minor ones.
- "nextStep": ONE single, concrete, low-effort next action the reader could take this week (under 140 characters) — never a purchase or a specific remedy/product recommendation.

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
 * One bounded Gemini call, given the report's full `scores` JSON as reference data. Throws on
 * unparseable JSON or fewer than 3 bullets — same discipline as `summarizeTimingWindows`: the
 * caller (reports.service.ts) catches this, logs it, and persists no verdict rather than
 * blocking the whole report on a non-essential enrichment.
 */
export async function generateReportVerdict(
  scores: Record<string, unknown>,
): Promise<ReportVerdict> {
  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: VERDICT_SCHEMA,
    messages: [
      { role: 'system', content: systemPrompt() },
      // No explicit condition argument: this prompt serialises the WHOLE scores
      // object, so `planetCondition` is already inside the JSON — passing it
      // again would print the strength block twice.
      reportFactsMessage(JSON.stringify(scores)),
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
