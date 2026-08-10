// =============================================================================
// Kundli Milan report — LLM narrative
// =============================================================================
// Turns the deterministic KundliMilanScores (guna milan, dashakoota, Manglik
// status, primary-person-only dosha/yoga facts) into narrative prose. No
// fallback filler on a bad response — same
// discipline as generateGemstoneReport/generateHouseInsight: an unparseable
// response throws so the orchestration layer marks the row failed and
// refunds, rather than caching generic text.
// =============================================================================

import { generate } from '../gemini-client.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE, MODEL } from '../../../config/llm.js';
import { cleanJsonString } from '../horoscope.js';
import type { KundliMilanScores } from '../../astro-engine/reports/kundli-milan.js';
import type { ReportSection } from '../../../modules/reports/report-generator.types.js';
import { formatReportVarga } from '../../astro-engine/reports/report-vargas.js';
import { reportFactsMessage } from './report-facts-message.js';

const GROUNDING_RULE =
  "The Guna Milan score, Dashakoota score and its per-porutham breakdown and overall verdict, Manglik status, compatibility band, both people's Navamsa (D9) charts, and primary-person dosha/yoga facts below are GIVEN FACTS, already computed by a deterministic classical Vedic algorithm. State them verbatim in your prose. Never recompute, second-guess, round differently, or contradict any of these numbers — your job is ONLY to explain what they mean in plain language.";
const PLAIN_LANGUAGE_RULE =
  'Write for someone with zero astrology background. Avoid untranslated Sanskrit/technical jargon where a plain-language equivalent exists (e.g. explain "Guna Milan" as a classical 36-point compatibility score the first time you use the term, rather than assuming the reader already knows it). Talk about real relationship themes (temperament, health, family harmony, communication), not planetary mechanics.';
const SAFETY_RULE =
  'This is advisory guidance for reflection, never a guarantee about the relationship\'s success or failure, and never a substitute for the couple\'s own judgment. Use tendency language ("suggests", "classically associated with"), never absolute predictions. Do not recommend specific remedies, pujas, or purchases — the app does not sell those here.';

function narrativeSystemPrompt(): string {
  return `You are writing a Kundli Milan (marriage compatibility) report for a mobile astrology app. The app already computed the Guna Milan score, Dashakoota score, and Manglik Dosha status for both people, plus a small set of additional dosha/yoga facts for the primary person (person1) only, using classical rules. Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[]}]}

Write EXACTLY 5 sections, in this order:
1. Heading close to "What Your Guna Milan Score Means" — 1-2 paragraphs explaining the total score out of 36, referencing the compatibility band given, highlighting the 1-2 strongest and weakest Kootas from the breakdown data, and briefly noting both people's given Navamsa (D9) Lagna as a corroborating classical layer on the same compatibility theme (not a separate topic).
2. Heading close to "Dashakoota Deep Dive" — 1-2 paragraphs: state the given Dashakoota overall verdict plainly, directly answering "what's the overall Dashakoot verdict on our compatibility" — then weave in what the given per-porutham breakdown says about health and longevity (Dina porutham), finances/progeny/children together (Mahendra porutham), and family stability/harmony at home (Rajju porutham, if its description flags a concern) — using the SAME given-fact, plain-language discipline as the rest of this report. If a specific theme's porutham isn't clearly favorable or unfavorable from the given description, don't force a claim about it.
3. Heading close to "Manglik Compatibility" — 1-2 paragraphs explaining each person's Manglik (Mangal Dosha) status given, and what a cancellation means in plain terms if one applies.
4. Heading close to "Your Chart's Additional Facts" — 1 paragraph on the primary person's (person1's) additional dosha/yoga facts given. Explicitly state that this panel reflects ONLY person1's chart, not person2's (the app does not compute this analysis for the partner). If no cautions are listed, note briefly that none were flagged.
5. Heading close to "Overall Recommendation" — 1 paragraph of balanced, reflective closing guidance that does not overstate certainty either way.

Each paragraph should be 2-4 sentences. Second person for person1 ("you"), third person ("your partner") for person2, unless names are given.`;
}

const RISK_GROUNDING_RULE =
  'The life-area synastry facts below (severity + evidence for wealth, health, children, harmony, career, timing, intimacy, in-laws) are ALSO GIVEN FACTS, computed by the same deterministic classical rules — the same synastry read the pricier Compatibility Match Report uses. State severities and evidence verbatim. Never invent a risk or benefit beyond what is listed.';

function narrativeSystemPromptCall2(): string {
  return `You are writing additional sections for a Kundli Milan (marriage compatibility) report for a mobile astrology app. The app already computed a classical synastry read across 8 life areas for this couple — wealth, health, children, harmony, career, timing, intimacy, in-laws — each with a severity (benefit/neutral/caution/serious) and supporting evidence. Your job is ONLY to write the narrative explanation for these.

${RISK_GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[]}]}

Write EXACTLY 2 sections, in this order:
1. Heading close to "Health, Wealth & Career Compatibility" — 1-2 paragraphs covering the given wealth, health, and career life-area facts together, directly answering "how well matched are we on health, finances, and career together."
2. Heading close to "Children, Family Harmony & Right Timing" — 1-2 paragraphs covering the given children, harmony, and in-laws life-area facts (directly answering "what does our chart say about having children together" and "how much harmony can we expect at home, between both families"), then the given timing life-area fact (directly answering "is the timing right for us, or should we wait").

Each paragraph should be 2-4 sentences. Second person for person1 ("you"), third person ("your partner") for person2, unless names are given.`;
}

function formatRiskFactor(factor: KundliMilanScores['riskFactors'][number]): string {
  return `${factor.key}: ${factor.severity} — ${factor.evidence.join('; ')}`;
}

function buildFactsCall2(scores: KundliMilanScores): string {
  return scores.riskFactors.map(formatRiskFactor).join('\n');
}

function buildFacts(scores: KundliMilanScores): string {
  const lines: string[] = [];
  lines.push(
    `Guna Milan (Ashtakoota) score: ${scores.gunaMilanScore} out of ${scores.gunaMaxScore}.`,
  );
  lines.push(`Compatibility band: ${scores.compatibilityBand}.`);

  const navamsa1 = scores.vargas?.[0];
  const navamsa2 = scores.partnerVargas?.[0];
  lines.push(
    `Person1's Navamsa (D9 — marriage/inner-strength chart): ${
      navamsa1 ? formatReportVarga(navamsa1) : 'unavailable on this chart'
    }.`,
  );
  lines.push(
    `Person2's (partner's) Navamsa (D9): ${
      navamsa2 ? formatReportVarga(navamsa2) : 'unavailable on this chart'
    }.`,
  );

  lines.push('Per-koota breakdown:');
  for (const k of scores.gunaBreakdown) {
    lines.push(`- ${k.name}: ${k.score}/${k.maxScore} — ${k.description}`);
  }
  lines.push(
    `Dashakoota (South Indian) score: ${scores.dashakootaScore} out of ${scores.dashakootaMaxScore}.`,
  );
  lines.push(`Dashakoota overall verdict: ${scores.dashakootaCompatibility ?? 'not classified'}.`);
  lines.push('Per-porutham (Dashakoota) breakdown:');
  for (const k of scores.dashakootaBreakdown) {
    lines.push(`- ${k.name}: ${k.score}/${k.maxScore} — ${k.description}`);
  }
  lines.push(
    `Manglik status — person1: ${scores.manglikStatus.person1 ? 'present' : 'not present'}; ` +
      `person2: ${scores.manglikStatus.person2 ? 'present' : 'not present'}; ` +
      `classically cancelled: ${scores.manglikStatus.cancelled ? 'yes' : 'no'}.`,
  );

  lines.push(
    'Additional dosha/yoga facts for PERSON1 ONLY (the app does not compute this analysis for person2/the partner):',
  );
  if (scores.primaryDoshaYoga.cautions.length > 0) {
    for (const c of scores.primaryDoshaYoga.cautions)
      lines.push(`- Caution: ${c.label}: ${c.detail}`);
  }
  if (scores.primaryDoshaYoga.positives.length > 0) {
    for (const p of scores.primaryDoshaYoga.positives)
      lines.push(`- Positive: ${p.label}: ${p.detail}`);
  }
  if (
    scores.primaryDoshaYoga.cautions.length === 0 &&
    scores.primaryDoshaYoga.positives.length === 0
  ) {
    lines.push('- None flagged.');
  }

  return lines.join('\n');
}

const SECTIONS_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
        },
        required: ['heading', 'paragraphs'],
      },
    },
  },
  required: ['sections'],
} as const;

function parseSections(raw: string): ReportSection[] | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as { sections?: unknown };
    if (!Array.isArray(data.sections) || data.sections.length === 0) return null;
    const sections: ReportSection[] = [];
    for (const entry of data.sections) {
      const e = entry as { heading?: unknown; paragraphs?: unknown };
      if (typeof e.heading !== 'string' || !e.heading.trim()) continue;
      if (!Array.isArray(e.paragraphs)) continue;
      const paragraphs = e.paragraphs.filter(
        (p): p is string => typeof p === 'string' && p.trim().length > 0,
      );
      if (paragraphs.length === 0) continue;
      sections.push({ heading: e.heading.trim(), paragraphs });
    }
    return sections.length > 0 ? sections : null;
  } catch {
    return null;
  }
}

async function generateSection(
  systemPrompt: string,
  facts: string,
  condition: string[] | undefined,
  userPrompt: string,
  label: string,
): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      { role: 'system', content: systemPrompt },
      reportFactsMessage(facts, condition),
      { role: 'user', content: userPrompt },
    ],
  });

  const parsed = parseSections(raw);
  if (!parsed) {
    void import('../../logger.js').then((m) =>
      m.logger.error({ raw, label }, 'unparseable JSON in kundli milan report narrative'),
    );
    throw new Error(`kundli milan LLM returned unparseable JSON (${label})`);
  }
  return parsed;
}

/**
 * Two bounded calls, run in parallel — the original 5 sections (Guna Milan, Dashakoota, Manglik,
 * person1's dosha/yoga, closing recommendation), plus 2 new sections covering the 8-life-area
 * synastry read (`riskFactors`) that answers questions the koota breakdowns alone never spoke to
 * directly: "how well matched are we on health/finance/career," "what about having children,"
 * "how much harmony at home," "is the timing right." Split into its own call (rather than folded
 * into the first) since the combined fact set — 2 koota breakdowns plus 8 evidence-bearing risk
 * factors — risks approaching REPORT_PROFILE's 4096-token ceiling, same reasoning wealth.ts/
 * true-love.ts document for their own multi-call splits.
 */
export async function generateKundliMilanNarrative(
  scores: KundliMilanScores,
): Promise<ReportSection[]> {
  const [main, risks] = await Promise.all([
    generateSection(
      narrativeSystemPrompt(),
      buildFacts(scores),
      scores.planetCondition,
      'Write the Kundli Milan report narrative.',
      'call1',
    ),
    generateSection(
      narrativeSystemPromptCall2(),
      buildFactsCall2(scores),
      scores.planetCondition,
      'Write the additional Kundli Milan report sections.',
      'call2',
    ),
  ]);
  return [...main, ...risks];
}

/** Referenced for parity with other report-type modules that report their model — see reports.service.ts. */
export const KUNDLI_MILAN_MODEL = MODEL;

/** Translates the two generated groups (first 5 sections, then the remaining 2) in parallel —
 * same split as generation. A caller passing fewer sections (e.g. a legacy-shaped fixture) still
 * works: an empty group simply short-circuits without an extra LLM call. */
export async function translateKundliMilanNarrative(
  sections: ReportSection[],
  targetLanguage: string,
): Promise<ReportSection[]> {
  const mainSections = sections.slice(0, 5);
  const riskSections = sections.slice(5);

  async function translateGroup(group: ReportSection[]): Promise<ReportSection[]> {
    if (group.length === 0) return [];
    return translateSectionGroup(group, targetLanguage);
  }

  const [mainTranslated, riskTranslated] = await Promise.all([
    translateGroup(mainSections),
    translateGroup(riskSections),
  ]);
  return [...mainTranslated, ...riskTranslated];
}

async function translateSectionGroup(
  sections: ReportSection[],
  targetLanguage: string,
): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_TRANSLATION_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      {
        role: 'user',
        content: `Translate the following report sections into the language "${targetLanguage}". Keep the exact same JSON structure ({"sections": [{"heading": string, "paragraphs": string[]}]}) and the same number of sections and paragraphs. ONLY translate the human-readable text.\n\nOriginal Content:\n${JSON.stringify({ sections }, null, 2)}`,
      },
    ],
  });

  const parsed = parseSections(raw);
  if (!parsed) {
    throw new Error(
      `kundli milan translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
  return parsed;
}
