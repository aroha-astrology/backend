// =============================================================================
// True Love report — LLM narrative
// =============================================================================
// 9 sections across 3 bounded LLM calls (comfortably under REPORT_PROFILE's
// 4096-token ceiling each): call 1 covers the original headline romance/
// partnership/tilt facts, call 2 covers the timing+age-band, archetype/
// trait-tilt, decade-by-decade romance arc, and dosha/yoga fact blocks, call
// 3 covers the partner archetype ("who am I drawn to"), a reflection on
// repeating patterns, and what's blocking this reader / how they'll
// recognize "the one" — same "split by theme, not by count" discipline
// marriage.ts's own multi-call narrative uses. No fallback filler on a bad
// response.
//
// Call 3 closes a real gap: the report's "what this report covers" i18n copy
// (reports.covers.true_love) promises answers to all 7 of its questions, but
// the original 2-call/6-section narrative only answered 4 of them — "what
// kind of person am I drawn to," "what patterns keep repeating," and "how
// will I recognize the one" had no matching section anywhere. Call 3 closes
// all 3, the last two as pure reflection grounded in facts already given
// elsewhere in this report (no new astro-engine computation needed), the
// first via astro-engine/reports/true-love.ts's new `partnerArchetype`
// (7th-house-themed, mirroring Marriage report's own `partnerArchetype`)
// rather than an ungrounded LLM guess about "who you're drawn to."
//
// The romance arc (romanceArc: DecadeBand[]) was computed by
// astro-engine/reports/true-love.ts from the start but never referenced by
// this file's buildFactsCall2/prompt — the same "computed but never fed"
// gap fixed for WealthScores.wealthArc in wealth.ts. It answers the
// covers-list bullet "How does my romantic life unfold decade by decade?"
// =============================================================================

import { generate } from '../gemini-client.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE } from '../../../config/llm.js';
import { cleanJsonString } from '../horoscope.js';
import { PLAIN_LANGUAGE_RULE } from '../house-insight.js';
import { formatReportVarga } from '../../astro-engine/reports/report-vargas.js';
import type { RankedWindow } from '../../astro-engine/reports/report-timing.js';
import type { DecadeBand } from '../../astro-engine/reports/report-decade-arc.js';
import type { TrueLoveScores } from '../../astro-engine/reports/true-love.js';
import type {
  ReportSection,
  SectionGenerationProgress,
} from '../../../modules/reports/report-generator.types.js';
import { reportFactsMessage } from './report-facts-message.js';

const GROUNDING_RULE =
  'The romance score, partnership score, Venus placement, and love-vs-arranged tilt below are GIVEN FACTS, already computed by a deterministic algorithm. State them verbatim. Never recompute or contradict any of these numbers.';
const SAFETY_RULE =
  'This is advisory guidance for reflection, never a guarantee about how a relationship will form, and never a substitute for the reader\'s own choices. Use tendency language ("suggests", "leans toward").';

const GROUNDING_RULE_2 =
  'The timing windows, age bands, romantic archetype, trait tilts, decade-by-decade romance arc, and dosha/yoga facts below are GIVEN FACTS, already computed by a deterministic algorithm. State every date, confidence level, trait score (0-10), decade score/tone, and dosha/yoga label VERBATIM. Never invent a date, a number, or a planetary combination that is not listed here. If no timing windows or no dosha/yoga facts are listed, say so plainly rather than inventing one.';
const SAFETY_RULE_2 =
  'This is advisory guidance for reflection, never a guarantee about WHEN or with WHOM romance will happen, and never a substitute for the reader\'s own choices. Use tendency language ("suggests", "classically associated with"). If a caution (e.g. Mangal Dosha) is listed, mention it calmly and factually, never alarmingly, and do not recommend specific remedies, pujas, or purchases — the app does not sell those here.';

function narrativeSystemPrompt(): string {
  return `You are writing a True Love Report for a mobile Vedic astrology app. The app already computed a romance score, a partnership score, whether Venus sits in a key house, and a love-vs-arranged tilt (0-10, higher = more love-marriage-leaning) using classical rules. Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[]}]}

Write EXACTLY 2 sections, in this order:
1. Heading close to "What This Means For You" — 2-3 paragraphs explaining the romance score, partnership score, and what the tilt given implies practically. If the tilt is roughly in the middle (4-6), explicitly frame it as a genuine hybrid — neither purely love-marriage nor strictly family-arranged — rather than forcing it toward one label. If it leans clearly to one side, say so plainly.
2. Heading close to "Family Blessing" — 1 paragraph on family harmony/blessing likelihood, grounded in the partnership score given (do not invent a separate number).

Each paragraph should be 2-4 sentences. Second person ("you").`;
}

function buildFacts(scores: TrueLoveScores): string {
  const lines: string[] = [];
  lines.push(`Romance score: ${scores.romanceScore} out of 100.`);
  lines.push(`Partnership score: ${scores.partnershipScore} out of 100.`);
  lines.push(`Venus in a key house (5th or 7th): ${scores.venusInKeyHouse ? 'yes' : 'no'}.`);
  lines.push(
    `Love-vs-arranged tilt: ${scores.loveVsArrangedTilt} out of 10 (higher = more love-marriage-leaning).`,
  );
  return lines.join('\n');
}

function narrativeSystemPromptCall2(): string {
  return `You are writing the second part of a True Love Report for a mobile Vedic astrology app. The app already computed timing windows for love/partnership, an age-relative confidence table, a romantic archetype with 5 named trait tilts (0-10), the Navamsa (D9) chart — the classical marriage/inner-strength varga, a corroborating layer alongside the D1 facts, not a replacement — a decade-by-decade romance arc (a 0-100 score plus tone for each of the next 3 decades), and a dosha/yoga summary (a Mangal Dosha caution if present, a wealth-yoga positive if present) using classical rules. Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE_2}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE_2}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[]}]}

Write EXACTLY 4 sections, in this order:
1. Heading close to "Your Timing Windows" — 1-2 paragraphs summarizing the timing windows given (their date ranges and confidence levels) and what the age-band table implies about near-term versus later favorable periods. If no windows are listed, say so plainly rather than inventing one.
2. Heading close to "Your Romantic Archetype" — 1-2 paragraphs naming the archetype given, describing the temperament sketch given, weaving in the 5 trait tilts as relative strengths (state the numbers given, never recompute them), and the given Navamsa Lagna/placements as a second, corroborating classical layer on the same romantic temperament (not a separate topic).
3. Heading close to "Blessings & Cautions" — 1 paragraph on the dosha/yoga facts given: mention the Mangal Dosha caution calmly if present, and the wealth-yoga positive if present. If neither is present, note briefly that no strong caution or featured yoga was flagged in this chart.
4. Heading close to "How Your Romantic Life Unfolds Decade By Decade" — 1-2 paragraphs walking through the given 3 decade bands and their scores/tones in order, framed as a long-arc pattern (not a fixed fate) — directly answer "how does my romantic life unfold decade by decade."

Each paragraph should be 2-4 sentences. Second person ("you").`;
}

const GROUNDING_RULE_3 =
  'The partner archetype, trait tilts, romantic archetype, and trait tilts below are GIVEN FACTS, already computed by a deterministic algorithm. State every label and trait score (0-10) VERBATIM. Never invent a fact, a number, or a specific detail (name, appearance, job, nationality) about a real individual — you are describing classical temperament tendencies, not a real person.';
const SAFETY_RULE_3 =
  'This is advisory guidance for reflection, never a guarantee about who someone will meet or what patterns will repeat, and never a substitute for the reader\'s own choices and self-awareness. Use tendency language ("tends to", "often", "may notice") — never an absolute claim.';

function narrativeSystemPromptCall3(): string {
  return `You are writing the third and final part of a True Love Report for a mobile Vedic astrology app. The app already computed a partner archetype (a 7th-house-themed temperament sketch of the kind of person this reader is naturally drawn to, with 5 trait tilts), plus everything from earlier in this report (a romantic archetype with 5 trait tilts, a love-vs-arranged tilt, and a dosha/yoga summary) using classical rules. Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE_3}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE_3}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[]}]}

Write EXACTLY 3 sections, in this order:
1. Heading close to "Who You're Naturally Drawn To" — 1-2 paragraphs naming the given partner archetype and weaving in its 5 trait tilts as relative strengths (state the numbers given, never recompute them) — this is a direct answer to "what kind of person am I naturally, deeply drawn to in love."
2. Heading close to "Patterns You Might Notice Repeating" — 1 paragraph reflecting on the given romantic archetype's trait tilts (which run notably high or low) and the love-vs-arranged tilt already given, to gently describe ONE recurring pattern this person may notice in their romantic life and why it may recur — grounded ONLY in the trait/tilt facts already given elsewhere in this report, never inventing a new fact. This directly answers "what patterns keep repeating in my love life, and why."
3. Heading close to "What's Really Blocking You — And How You'll Recognize The One" — 2 paragraphs: first, using the given trait tilts and any dosha caution already given, name the ONE factor most likely to get in this person's way of finding or keeping love, framed constructively, not alarmingly (directly answers "what's really blocking me"); second, using the given partner archetype and romantic archetype together, describe 2-3 concrete, plain-language signs this person will likely feel when they meet a compatible partner (directly answers "how will I recognize the one").

Each paragraph should be 2-4 sentences. Second person ("you").`;
}

function buildFactsCall3(scores: TrueLoveScores): string {
  const lines: string[] = [];
  lines.push(`Partner archetype: "${scores.partnerArchetype.label}".`);
  lines.push(`Partner archetype description: ${scores.partnerArchetype.description}`);
  lines.push('Partner archetype trait tilts (0-10, given — state verbatim):');
  for (const t of scores.partnerArchetype.traits) lines.push(`- ${t.label}: ${t.score}`);

  lines.push(
    `Romantic archetype (already introduced earlier in this report): "${scores.archetype.label}".`,
  );
  lines.push('Romantic archetype trait tilts (0-10, given — state verbatim):');
  for (const t of scores.archetype.traits) lines.push(`- ${t.label}: ${t.score}`);

  lines.push(
    `Love-vs-arranged tilt (already given): ${scores.loveVsArrangedTilt} out of 10 (higher = more love-marriage-leaning).`,
  );

  if (scores.doshaYoga.cautions.length > 0) {
    lines.push('Cautions already given:');
    for (const c of scores.doshaYoga.cautions) lines.push(`- ${c.label}: ${c.detail}`);
  } else {
    lines.push('No dosha caution was given for this chart.');
  }

  return lines.join('\n');
}

function formatWindowForFacts(window: RankedWindow): string {
  const start = new Date(window.startDate).toISOString().slice(0, 7);
  const end = new Date(window.endDate).toISOString().slice(0, 7);
  return `${start} to ${end} (confidence: ${window.level})`;
}

function formatRomanceArc(romanceArc: DecadeBand[]): string {
  if (romanceArc.length === 0) return 'unavailable.';
  return romanceArc.map((b) => `${b.label}: ${b.score}/100 (${b.tone}).`).join(' ');
}

function buildFactsCall2(scores: TrueLoveScores): string {
  const lines: string[] = [];

  lines.push(
    'Timing windows (favorable love/partnership Mahadasha-Antardasha periods, given — do not invent dates beyond these):',
  );
  if (scores.windows.length === 0) {
    lines.push('- None identified.');
  } else {
    for (const w of scores.windows) lines.push(`- ${formatWindowForFacts(w)}`);
  }

  lines.push('Age bands (current-age-relative confidence buckets, given):');
  for (const b of scores.ageBands) {
    lines.push(`- ${b.label}: ${b.confidence}`);
  }

  lines.push(`Romantic archetype: "${scores.archetype.label}".`);
  lines.push(`Archetype description: ${scores.archetype.description}`);
  lines.push('Trait tilts (0-10, given — state verbatim):');
  for (const t of scores.archetype.traits) {
    lines.push(`- ${t.label}: ${t.score}`);
  }

  const navamsa = scores.vargas?.[0];
  lines.push(
    navamsa
      ? `Navamsa (D9 — marriage/inner-strength chart): ${formatReportVarga(navamsa)}.`
      : 'Navamsa (D9): unavailable on this chart.',
  );

  if (scores.doshaYoga.cautions.length > 0) {
    lines.push('Cautions to hold carefully (given):');
    for (const c of scores.doshaYoga.cautions) lines.push(`- ${c.label}: ${c.detail}`);
  }
  if (scores.doshaYoga.positives.length > 0) {
    lines.push('Positive yogas supporting you (given):');
    for (const p of scores.doshaYoga.positives) lines.push(`- ${p.label}: ${p.detail}`);
  }
  if (scores.doshaYoga.cautions.length === 0 && scores.doshaYoga.positives.length === 0) {
    lines.push('No specific dosha caution or featured yoga was detected in this chart.');
  }

  lines.push(`Decade-by-decade romance arc: ${formatRomanceArc(scores.romanceArc)}`);

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

async function callAndParse(
  systemPrompt: string,
  facts: string,
  condition: string[] | undefined,
  label: string,
): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      { role: 'system', content: systemPrompt },
      reportFactsMessage(facts, condition),
      { role: 'user', content: 'Write this part of the True Love report narrative.' },
    ],
  });

  const parsed = parseSections(raw);
  if (!parsed) {
    void import('../../logger.js').then((m) =>
      m.logger.error({ raw, label }, 'unparseable JSON in true love report narrative'),
    );
    throw new Error(`true love report LLM returned unparseable JSON (${label})`);
  }
  return parsed;
}

/**
 * 3 bounded calls — see module doc comment for the split rationale. Independently resumable,
 * same pattern as generateMarriageNarrative — see that function's doc comment for the full
 * rationale.
 */
export async function generateTrueLoveNarrative(
  scores: TrueLoveScores,
  progress?: SectionGenerationProgress,
): Promise<ReportSection[]> {
  const existing = progress?.existingGroups ?? [];

  async function callOrResume(
    index: number,
    systemPrompt: string,
    facts: string,
    label: string,
  ): Promise<ReportSection[]> {
    const cached = existing[index];
    if (cached) return cached;
    const group = await callAndParse(systemPrompt, facts, scores.planetCondition, label);
    await progress?.onGroupComplete(group);
    return group;
  }

  const part1 = await callOrResume(0, narrativeSystemPrompt(), buildFacts(scores), 'call1');
  const part2 = await callOrResume(
    1,
    narrativeSystemPromptCall2(),
    buildFactsCall2(scores),
    'call2',
  );
  const part3 = await callOrResume(
    2,
    narrativeSystemPromptCall3(),
    buildFactsCall3(scores),
    'call3',
  );
  return [...part1, ...part2, ...part3];
}

export async function translateTrueLoveNarrative(
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
      `true love report translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
  return parsed;
}
