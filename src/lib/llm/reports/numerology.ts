// =============================================================================
// Numerology report — LLM narrative
// =============================================================================
// Turns the deterministic NumerologyScores into narrative prose across 3
// bounded calls (comfortably under REPORT_PROFILE's 4096-token ceiling each),
// 2 sections per call, 6 sections total — same discipline as marriage.ts:
//   call 1: core identity numbers (Mulank, Bhagyank, Life Path, Expression,
//           Soul Urge, Personality, Lucky Numbers) + what they mean
//   call 2: Lo Shu Grid + Name Planes, and Challenge Numbers + Kua Number
//   call 3: this year/month's Personal Year/Month, and the 12-month forecast
// No fallback filler on a bad response — an unparseable response throws so
// the orchestration layer marks the row failed and refunds, rather than
// caching generic text (same discipline as generateMarriageNarrative).
//
// A first audit pass found and fixed one gap: the given Bhagyank was never
// explicitly tied to the covers-list's "ideal career direction" question. A
// deeper pass against the FULL 7-question covers.numerology list found 3
// more real gaps, each closed with a new grounded fact (not just a prompt
// instruction, since no existing fact spoke to these): `nameAlignment`
// (reuses name-change.ts's own `computeNameAlignment` — "does my current
// name numerologically support my birth-date numbers"), `luckyDayColor`
// ("what are my luckiest... days, and colors" — only numbers existed before),
// and `yearlyForecast` (5 years ahead — the existing `monthlyForecast` only
// reaches 12 months, not "years ahead"). 8 sections across the same 3 calls
// now (one new section each in call1 and call3).
// =============================================================================

import { generate } from '../gemini-client.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE } from '../../../config/llm.js';
import { cleanJsonString } from '../horoscope.js';
import { PLAIN_LANGUAGE_RULE } from '../house-insight.js';
import type { NumerologyScores } from '../../astro-engine/reports/numerology.js';
import type { ReportSection } from '../../../modules/reports/report-generator.types.js';
import { reportFactsMessage } from './report-facts-message.js';

const GROUNDING_RULE =
  'Every number, grid, and forecast entry below is a GIVEN FACT, already computed by deterministic numerology formulas (the Vedic Mulank/Bhagyank/Kua system and the Western Pythagorean Life Path/Expression/Soul Urge/Personality system) — never recompute, second-guess, round differently, invent a new number, or contradict any of them. Your job is ONLY to explain what they mean in plain language.';
const SAFETY_RULE =
  'This is advisory guidance for reflection and self-understanding, never a guarantee about real-world outcomes, and never a substitute for the reader\'s own judgment and choices. Use tendency language ("suggests", "classically associated with", "tends to"), never absolute predictions. Do not recommend specific remedies, gemstones, pujas, or purchases — the app does not sell those here.';

function narrativeSystemPromptCall1(): string {
  return `You are writing the opening section of a Numerology Report for a mobile Vedic astrology app. The app already computed the reader's Mulank (psychic/day number), Bhagyank (destiny number), Life Path number, Expression number, Soul Urge number, Personality number, and a set of lucky numbers, all from their own name and date of birth. Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[]}]}

Write EXACTLY 3 sections, in this order:
1. Heading close to "Your Core Numbers" — 1-3 paragraphs explaining the given Mulank and Bhagyank (Vedic day-vibration and destiny numbers) and the given Life Path number (the Western equivalent long-arc number), in plain language, weaving in what each number classically means. Explicitly touch on what the given Bhagyank (destiny number) classically suggests about the reader's ideal career direction — directly answer "what does my Destiny Number say about my ideal career direction."
2. Heading close to "Expression, Soul Urge & Personality" — 1-3 paragraphs explaining the given Expression number (natural talents), Soul Urge number (inner desire), and Personality number (the image you project), plus the given lucky numbers woven in naturally.
3. Heading close to "Does Your Name Support Your Numbers" — 1-2 paragraphs stating the given name-alignment classification (aligned/partially_aligned/misaligned) plainly and what it means, directly answering "does my current name numerologically support my birth-date numbers, or work against them." If misaligned or only partially aligned, mention the given target number(s) as what a more supportive name would add up to, WITHOUT suggesting a specific new spelling (that is the separate Name Change report's job) — frame this as awareness, not a call to action.

Each paragraph should be 2-4 sentences. Second person ("you").`;
}

function narrativeSystemPromptCall2(): string {
  return `You are writing the second section of a Numerology Report for a mobile Vedic astrology app. The app already computed the reader's Lo Shu Grid (a 3x3 magic-square count of digits 1-9 in their DOB, with which digits are missing), their Name Planes (a 4-way classification of the letters in their name into knowledge/strength/emotional/spiritual groups), their 4 Challenge Numbers (life-cycle challenges across 4 age brackets), and their Kua Number + Feng Shui element. Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[]}]}

Write EXACTLY 2 sections, in this order:
1. Heading close to "Your Lo Shu Grid & Name Planes" — 1-3 paragraphs explaining which digits are strong (frequent) or missing in the given Lo Shu Grid and what that classically suggests, plus the given Name Planes balance (which of the 4 groups dominates the name and what that suggests about temperament).
2. Heading close to "Challenge Numbers & Kua Element" — 1-2 paragraphs walking through the given 4 challenge numbers by age bracket (framed as growth areas to navigate, not fixed obstacles) and the given Kua Number/element (brief Feng Shui flavor, e.g. favorable directions/energies associated with that element). Close with one sentence directly answering "are there numbers or dates I should avoid for major decisions" — reflecting on the given challenge numbers as the numbers this reader's own chart suggests approaching major decisions around more cautiously, not as fixed forbidden dates.

Each paragraph should be 2-4 sentences. Second person ("you").`;
}

function narrativeSystemPromptCall3(): string {
  return `You are writing the closing section of a Numerology Report for a mobile Vedic astrology app. The app already computed the reader's current Personal Year and Personal Month numbers (as of today), and a rolling 12-month forecast of Personal Month numbers starting this month. Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[]}]}

Write EXACTLY 3 sections, in this order:
1. Heading close to "This Year & This Month" — 1-2 paragraphs explaining the given current Personal Year number (the year's overall theme) and current Personal Month number (this month's flavor within that year), in plain language.
2. Heading close to "Your 12-Month Forecast" — 1-3 paragraphs walking through the given 12-month forecast, grouping months with the same or similar Personal Month numbers together rather than listing all 12 individually, framed as a rhythm to notice, not a fixed script.
3. Heading close to "Your Luckiest Days, Colors & Years Ahead" — 1-2 paragraphs: state the given luckiest day and color(s) plainly (directly answering "what are my luckiest numbers, days, and colors" alongside the lucky numbers already given earlier in this report), THEN walk through the given 5-year forecast, naming which of the given years reads numerologically strongest — directly answering "which years ahead are numerologically strongest for me."

Each paragraph should be 2-4 sentences. Second person ("you").`;
}

function buildFactsCall1(scores: NumerologyScores): string {
  const lines: string[] = [];
  lines.push(`Name used: ${scores.name}. Date of birth used: ${scores.dob}.`);
  lines.push(`Mulank (psychic/day number): ${scores.mulank}.`);
  lines.push(`Bhagyank (destiny number): ${scores.bhagyank}.`);
  lines.push(`Life Path number: ${scores.lifePath}.`);
  lines.push(`Expression number: ${scores.expression}.`);
  lines.push(`Soul Urge number: ${scores.soulUrge}.`);
  lines.push(`Personality number: ${scores.personality}.`);
  lines.push(`Lucky numbers: ${scores.luckyNumbers.join(', ')}.`);
  lines.push(
    `Name alignment: ${scores.nameAlignment.alignment}. Target number(s) for a more supportive name: ${scores.nameAlignment.targets.join(', ')}.`,
  );
  return lines.join('\n');
}

function buildFactsCall2(scores: NumerologyScores): string {
  const lines: string[] = [];
  const grid = scores.loShuGrid;
  const frequencyList = Object.entries(grid.frequencies)
    .map(([digit, count]) => `${digit}: appears ${count}x`)
    .join(', ');
  lines.push(`Lo Shu Grid digit frequencies (from the DOB): ${frequencyList}.`);
  lines.push(
    `Missing digits (never appear in the DOB): ${grid.missing.length > 0 ? grid.missing.join(', ') : 'none — every digit 1-9 appears at least once'}.`,
  );
  const planes = scores.namePlanes;
  lines.push(
    `Name Planes letter counts: knowledge ${planes.knowledge}, strength ${planes.strength}, emotional ${planes.emotional}, spiritual ${planes.spiritual}.`,
  );
  const challenges = scores.challengeNumbers;
  lines.push(
    `Challenge numbers by age bracket: ${challenges.phases.map((p) => `age ${p.ageRange}: ${p.challenge}`).join('; ')}.`,
  );
  lines.push(`Kua Number: ${scores.kua.kuaNumber}. Feng Shui element: ${scores.kua.element}.`);
  return lines.join('\n');
}

function buildFactsCall3(scores: NumerologyScores): string {
  const lines: string[] = [];
  lines.push(`Current Personal Year number: ${scores.personalYear}.`);
  lines.push(`Current Personal Month number: ${scores.personalMonth}.`);
  lines.push(
    `12-month forecast starting this month: ${scores.monthlyForecast
      .map(
        (m) =>
          `${m.month} ${m.year}: Personal Month ${m.personalMonth} (Personal Year ${m.personalYear})`,
      )
      .join('; ')}.`,
  );
  lines.push(
    `Luckiest day: ${scores.luckyDayColor.day}. Luckiest colors: ${scores.luckyDayColor.colors.join(', ') || 'unavailable'}.`,
  );
  lines.push(
    `5-year forecast: ${scores.yearlyForecast.map((y) => `${y.year}: Personal Year ${y.personalYear}`).join('; ')}.`,
  );
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
      { role: 'user', content: 'Write this part of the Numerology Report narrative.' },
    ],
  });

  const parsed = parseSections(raw);
  if (!parsed) {
    void import('../../logger.js').then((m) =>
      m.logger.error({ raw, label }, 'unparseable JSON in numerology report narrative'),
    );
    throw new Error(`numerology report LLM returned unparseable JSON (${label})`);
  }
  return parsed;
}

/** 3 bounded calls — see module doc comment for the split rationale. */
export async function generateNumerologyNarrative(
  scores: NumerologyScores,
): Promise<ReportSection[]> {
  const part1 = await callAndParse(
    narrativeSystemPromptCall1(),
    buildFactsCall1(scores),
    scores.planetCondition,
    'call1',
  );
  const part2 = await callAndParse(
    narrativeSystemPromptCall2(),
    buildFactsCall2(scores),
    scores.planetCondition,
    'call2',
  );
  const part3 = await callAndParse(
    narrativeSystemPromptCall3(),
    buildFactsCall3(scores),
    scores.planetCondition,
    'call3',
  );
  return [...part1, ...part2, ...part3];
}

/** Translate an already-generated (concatenated) section list — one call, same idiom as
 * translateMarriageNarrative. Shape-agnostic: works over whatever number of sections
 * `generateNumerologyNarrative` produced, since it only ever round-trips the generic
 * {sections: [{heading, paragraphs}]} shape without assuming a fixed count. */
export async function translateNumerologyNarrative(
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
      `numerology report translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
  return parsed;
}
