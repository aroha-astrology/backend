// =============================================================================
// Remedies report — LLM narrative
// =============================================================================
// 1 LLM call, 4 sections — given the reader's present karmic debts (Rin),
// Pakka Ghar (permanent house) placements, blind planets, and a Lal Kitab
// natal remedy per classical planet, explain what each means and how to
// apply the remedies. No fallback filler on a bad response — same
// discipline as generateNameChangeNarrative/generateMarriageNarrative.
// =============================================================================

import { generate } from '../gemini-client.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE } from '../../../config/llm.js';
import { cleanJsonString } from '../horoscope.js';
import { PLAIN_LANGUAGE_RULE } from '../house-insight.js';
import type { RemediesScores } from '../../astro-engine/reports/remedies.js';
import type { ReportSection } from '../../../modules/reports/report-generator.types.js';
import { reportFactsMessage } from './report-facts-message.js';

const GROUNDING_RULE =
  "Every karmic debt, Pakka Ghar placement, blind-planet flag, and planet remedy below is a GIVEN FACT, already computed by a deterministic Lal Kitab analysis of the reader's natal chart. Never recompute, second-guess, invent a new debt/placement, or invent a remedy beyond the ones given — your job is ONLY to explain what each given fact means and how to apply the given remedies.";
const SAFETY_RULE =
  'This is traditional Lal Kitab guidance for reflection and everyday lifestyle practice, never a guarantee about real-world outcomes, and never a substitute for the reader\'s own judgment or professional (medical/legal/financial) advice. Use tendency language ("classically associated with", "considered supportive of", "traditionally suggested to"), never absolute predictions. Lal Kitab remedies are deliberately simple, everyday, low-cost lifestyle actions (donations, household items, dietary habits, small rituals) — do NOT invent or recommend gemstones, expensive purchases, or elaborate rituals beyond what is given.';
const EMPTY_SECTION_RULE =
  'If a given list (debts, Pakka Ghar placements, blind planets, or planet remedies) is EMPTY, say so plainly and briefly in that section — a neutral, reassuring statement that nothing of that type was flagged for this chart — rather than inventing an entry or skipping the section outright.';

function narrativeSystemPrompt(): string {
  return `You are writing a Remedies Report for a mobile Vedic astrology app, grounded in Lal Kitab (a practical, remedy-focused branch of Vedic astrology). The app already computed the reader's present karmic debts (Rin), Pakka Ghar (permanent house) placements, blind (obstructed) planets, and a natal remedy for each classical planet in its own house. Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}
${EMPTY_SECTION_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[]}]}

Write EXACTLY 4 sections, in this order:
1. Heading close to "Your Karmic Debts (Rin)" — for each given present debt, name it in plain language, explain what it classically indicates (using the given indicators), and state its given remedy. If none are present, say so per EMPTY_SECTION_RULE.
2. Heading close to "Planet-by-Planet Remedies" — walk through each given planet's natal house and its given remedy/remedies, grouped naturally (2-4 sentences per planet is fine, or combine briefly-treated planets into one paragraph if there are many). Do not repeat a remedy verbatim twice.
3. Heading close to "Your Strengths and Cautions" — explain the given Pakka Ghar placements as natural strengths (planets giving their fullest, most confident results), and the given blind planets as areas needing gentle extra attention (obstructed, so their results need the remedy work above to fully express). If either list is empty, say so per EMPTY_SECTION_RULE.
4. Heading close to "How to Use These Remedies" — 1-2 paragraphs of practical guidance: pick 2-3 remedies to start with rather than all at once, practice them consistently (Lal Kitab remedies are traditionally given weeks-to-months to show effect, not days), and keep them as calm daily/weekly habits rather than one-off events. End with a brief, one-sentence restatement of SAFETY_RULE's framing.

Each paragraph should be 2-4 sentences. Second person ("you").`;
}

function buildFacts(scores: RemediesScores): string {
  const lines: string[] = [];

  if (scores.presentDebts.length > 0) {
    lines.push('Present karmic debts (Rin):');
    for (const d of scores.presentDebts) {
      lines.push(
        `- ${d.type}: indicators [${d.indicators.join('; ')}]. Remedies: ${d.remedies.join('; ')}.`,
      );
    }
  } else {
    lines.push('Present karmic debts (Rin): NONE flagged for this chart.');
  }

  if (scores.planetRemedies.length > 0) {
    lines.push('Planet-by-planet natal remedies:');
    for (const p of scores.planetRemedies) {
      lines.push(
        `- ${p.planet} in house ${p.house}: remedies [${p.remedies.join('; ')}]${
          p.totke.length > 0 ? `, totke (folk remedies) [${p.totke.join('; ')}]` : ''
        }.`,
      );
    }
  } else {
    lines.push('Planet-by-planet natal remedies: NONE available (chart house data missing).');
  }

  if (scores.pakkaGharPlacements.length > 0) {
    lines.push(
      `Pakka Ghar (permanent house) placements, strong: ${scores.pakkaGharPlacements
        .map((p) => `${p.planet} (house ${p.currentHouse})`)
        .join(', ')}.`,
    );
  } else {
    lines.push(
      'Pakka Ghar (permanent house) placements: NONE — no planet sits in its own permanent house in this chart.',
    );
  }

  if (scores.blindPlanets.length > 0) {
    lines.push(
      `Blind (obstructed) planets: ${scores.blindPlanets
        .map(
          (p) =>
            `${p.planet} (${p.isBlind ? 'fully blind' : 'half-blind'}, house ${p.house}) — ${p.reason}`,
        )
        .join('; ')}.`,
    );
  } else {
    lines.push('Blind (obstructed) planets: NONE flagged for this chart.');
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

export async function generateRemediesNarrative(scores: RemediesScores): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      { role: 'system', content: narrativeSystemPrompt() },
      reportFactsMessage(buildFacts(scores), scores.planetCondition, scores.vakriFacts),
      { role: 'user', content: 'Write the Remedies report narrative.' },
    ],
  });

  const parsed = parseSections(raw);
  if (!parsed) {
    void import('../../logger.js').then((m) =>
      m.logger.error({ raw }, 'unparseable JSON in remedies report narrative'),
    );
    throw new Error('remedies report LLM returned unparseable JSON');
  }
  return parsed;
}

export async function translateRemediesNarrative(
  sections: ReportSection[],
  targetLanguage: string,
): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_TRANSLATION_PROFILE,
    messages: [
      {
        role: 'user',
        content: `Translate the following report sections into the language "${targetLanguage}". Keep the exact same JSON structure ({"sections": [{"heading": string, "paragraphs": string[]}]}) and the same number of sections and paragraphs. Do NOT translate proper nouns (planet names, debt type names like "Pitra Rin"), but DO translate the surrounding prose.\n\nOriginal Content:\n${JSON.stringify({ sections }, null, 2)}`,
      },
    ],
    responseSchema: SECTIONS_SCHEMA,
  });

  const parsed = parseSections(raw);
  if (!parsed) {
    throw new Error(
      `remedies report translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
  return parsed;
}
