// =============================================================================
// Relationship (monthly) report — LLM narrative
// =============================================================================
// 4 sections, 1 bounded LLM call (comfortably under REPORT_PROFILE's 4096
// token ceiling). No fallback filler on a bad response.
//
// Section 4 ("Friction, Reconciliation & Dating") was added to close a gap: covers.
// relationship_monthly asks "what might cause friction," "is this a favorable month for
// reconciliation," and "what should I watch for if I'm single and dating" — none of these were
// explicitly instructed even though every fact needed to answer them (tone, month score, the
// active dasha lords, dosha cautions) was already being fed via buildFacts.
//
// "Specific days this month best for important relationship talks" was previously flagged here
// as unanswerable without new astro-engine computation — now closed via
// monthly-dasha-context.ts's `findMonthSubPeriods` (shared with the other 3 monthly report
// types), which resolves Pratyantardasha-level sub-periods within the target month, each
// independently scored.
// =============================================================================

import { generate } from '../gemini-client.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE } from '../../../config/llm.js';
import { cleanJsonString } from '../horoscope.js';
import { PLAIN_LANGUAGE_RULE, HOUSE_SIGNIFICATIONS } from '../house-insight.js';
import { formatReportVarga } from '../../astro-engine/reports/report-vargas.js';
import type { RelationshipMonthlyScores } from '../../astro-engine/reports/relationship-monthly.js';
import type { ReportSection } from '../../../modules/reports/report-generator.types.js';
import { reportFactsMessage } from './report-facts-message.js';

const GROUNDING_RULE =
  'The active Mahadasha/Antardasha lords, the month score, the tone, and the dosha/yoga facts below are GIVEN FACTS, already computed by a deterministic algorithm. State them verbatim. Never recompute or contradict any of these, and never invent a dosha or yoga that is not listed.';
const SAFETY_RULE =
  'Use tendency language ("suggests", "supports") — never guarantee a specific relationship outcome or event. If a caution (e.g. Mangal Dosha) is listed, mention it calmly and factually, never alarmingly, and do not recommend specific remedies, pujas, or purchases — the app does not sell those here.';
const SUB_PERIOD_RULE =
  'The given within-month sub-periods (if any) break the month into specific date ranges, each with its own ruling planet and 0-100 score — directly answer "are there specific days this month best for important relationship talks" by naming the date range(s) with a notably HIGHER score as the better windows for an important conversation, and any notably LOWER-scored range(s) as ones to avoid for sensitive topics. If no sub-periods are given, say plainly that no date-level breakdown is available for this chart rather than inventing one.';
const RELATIONSHIP_STATUS_RULE =
  "The reader's current relationship status is given below — if it is single/not provided, do not assume an existing partner; frame guidance around dating/romance readiness instead of an existing relationship. If it names an existing partner (in a relationship/engaged/married/etc.), frame guidance around that existing partnership.";

function narrativeSystemPrompt(): string {
  return `You are writing this month's Relationship Report section for a mobile Vedic astrology app. The app already computed which Mahadasha/Antardasha planetary period rules the given month, a month score, and a tone (challenging/mixed/favorable), based on how that period's ruling planet relates to the 7th house (${HOUSE_SIGNIFICATIONS[7]}) and 5th house (${HOUSE_SIGNIFICATIONS[5]}), plus the Navamsa (D9) chart — the classical marriage/inner-strength varga, a corroborating layer alongside those houses. Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}
${SUB_PERIOD_RULE}
${RELATIONSHIP_STATUS_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[]}]}

Write EXACTLY 4 sections, in this order:
1. Heading close to "This Month's Outlook" — 1-2 paragraphs explaining the tone and month score given, in terms of partnership harmony and romance/connection themes, briefly weaving in the given Navamsa placement as supporting classical color (not a separate topic).
2. Heading close to "Practical Guidance" — 1-2 paragraphs of general, practical relationship-behavior framing tied to the tone, including one concrete pointer for strengthening emotional closeness this month.
3. Heading close to "Blessings & Cautions" — 1 paragraph on the dosha/yoga facts given: mention the Mangal Dosha caution calmly if present. If not present, note briefly that no standing caution was flagged in this chart.
4. Heading close to "Friction, Reconciliation, Dating & Timing" — 2-3 paragraphs covering: (a) name what could realistically cause friction this month for someone with a partner, tying it to the given active dasha lord and any given dosha caution; (b) state plainly, based on the given tone, whether this reads as a supportive month to attempt reconciliation after a recent conflict, or whether more patience is needed first; (c) for readers who are single and dating, note briefly that the same monthly tone/score applies to romance and dating themes generally (not only existing partnerships), and give one pointer for what to watch for this month; (d) the given within-month sub-periods per SUB_PERIOD_RULE.

Each paragraph should be 2-4 sentences. Second person ("you").`;
}

function buildFacts(scores: RelationshipMonthlyScores): string {
  const lines = [
    `Period: ${scores.periodMonth}.`,
    `Active Mahadasha lord: ${scores.activeMahadashaLord}.`,
    `Active Antardasha lord: ${scores.activeAntardashaLord}.`,
    `Month score: ${scores.monthScore} out of 100.`,
    `Tone: ${scores.tone}.`,
    `Reader's current relationship status: ${scores.relationshipStatus ?? 'not provided'}.`,
  ];

  const navamsa = scores.vargas?.[0];
  lines.push(
    navamsa
      ? `Navamsa (D9 — marriage/inner-strength chart): ${formatReportVarga(navamsa)}.`
      : 'Navamsa (D9): unavailable on this chart.',
  );

  if (scores.userAnswers?.concern) {
    lines.push(
      `Reader-provided context — a specific concern they'd like this reading to keep in mind (optional, take it into account where relevant): ${scores.userAnswers.concern}`,
    );
  }

  if (scores.doshaYoga.cautions.length > 0) {
    lines.push('Cautions to hold carefully (given):');
    for (const c of scores.doshaYoga.cautions) lines.push(`- ${c.label}: ${c.detail}`);
  } else {
    lines.push('No standing dosha caution was flagged in this chart.');
  }

  if (scores.subPeriods.length > 0) {
    lines.push('Within-month sub-periods (specific dates, ruling lord, 0-100 score):');
    for (const p of scores.subPeriods) {
      lines.push(
        `- ${p.startDate.toISOString().slice(0, 10)} to ${p.endDate.toISOString().slice(0, 10)}: ${p.lord}, score ${p.score}.`,
      );
    }
  } else {
    lines.push('Within-month sub-periods: none available.');
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

export async function generateRelationshipMonthlyNarrative(
  scores: RelationshipMonthlyScores,
): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      { role: 'system', content: narrativeSystemPrompt() },
      reportFactsMessage(buildFacts(scores), scores.planetCondition),
      { role: 'user', content: "Write this month's Relationship report narrative." },
    ],
  });

  const parsed = parseSections(raw);
  if (!parsed) {
    void import('../../logger.js').then((m) =>
      m.logger.error({ raw }, 'unparseable JSON in relationship monthly report narrative'),
    );
    throw new Error('relationship monthly report LLM returned unparseable JSON');
  }
  return parsed;
}

export async function translateRelationshipMonthlyNarrative(
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
      `relationship monthly report translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
  return parsed;
}
