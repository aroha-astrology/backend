// =============================================================================
// Past Life report — LLM narrative
// =============================================================================
// Thinnest-margin report in the catalogue (₹25) — kept to exactly ONE LLM
// call by design, unlike the multi-call marriage/kundli-milan reports (now 3
// sections instead of 2, still 1 call — the fact set here is light enough
// that a 3rd short section fits comfortably under REPORT_PROFILE's token
// ceiling without needing a 2nd call). No fallback filler on a bad response —
// an unparseable response throws so the orchestration layer marks the row
// failed and refunds.
//
// The 3rd section closes real gaps against reports.covers.past_life: the
// original 2-section narrative never explicitly answered "what unfinished
// business have I carried into this life" or "what is this lifetime's core
// soul lesson," and answered "which past-life talents/skills carried
// forward" only when a favorable yoga happened to be present (silently
// skipped otherwise, which is the common case — only mahapurusha/benefic
// yogas are checked here). All three are closed with pure reflection on
// facts already computed (Rahu/Ketu house+sign, karmic archetype) — no new
// deterministic computation needed.
// =============================================================================

import { generate } from '../gemini-client.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE } from '../../../config/llm.js';
import { cleanJsonString } from '../horoscope.js';
import { PLAIN_LANGUAGE_RULE } from '../house-insight.js';
import type { PastLifeScores } from '../../astro-engine/reports/past-life.js';
import { formatReportVarga } from '../../astro-engine/reports/report-vargas.js';
import type { ReportSection } from '../../../modules/reports/report-generator.types.js';
import { reportFactsMessage } from './report-facts-message.js';

const GROUNDING_RULE =
  'The Rahu house/sign, Ketu house/sign, 12th-lord strength, any conjunct planets, and any favorable yoga below are GIVEN FACTS, already computed from the chart. State them verbatim. Never invent a different house, sign, planet, or yoga than what is given.';
const SAFETY_RULE =
  'This is reflective, classical Rahu/Ketu axis interpretation for entertainment and self-reflection — never a literal claim about a verifiable past life, never a guarantee. Use tendency language ("classically associated with", "suggests a theme of").';
const ARCHETYPE_RULE =
  'The karmic archetype label/description below is a GIVEN FACT — a deterministic house-axis theme, not something you invent. Weave it in as the overarching frame for the axis, but keep it as generic/classical tendency language, never a specific prediction about identifying details of a past life.';
const SHASHTIAMSHA_RULE =
  'The Shashtiamsha (D60) chart below — the most fine-grained classical varga, traditionally read for overall karmic destiny — is a GIVEN FACT. Weave it in as ONE brief sentence of extra classical color alongside the karmic archetype theme (per ARCHETYPE_RULE), never as a separate topic.';
const KAAL_SARP_RULE =
  'The Kaal Sarp Dosha note below (present or not) is a GIVEN FACT. If present, mention it calmly and matter-of-factly as a classical condition where all planets fall between the Rahu/Ketu axis, intensifying the karmic-release theme AND any fears/blocks theme already raised for Rahu — never alarming language, no specific remedies or purchases recommended. If not present, you may skip the mention entirely.';
const YOGA_RULE =
  "Any favorable yoga listed below (if present) is a GIVEN FACT — a specific classical placement, not something you invent. Frame it as a specific talent or skill classically read as carried forward from a past life, in the same tendency language as everything else here. If no favorable yoga is present, do NOT skip this question — instead name Ketu's own house/sign placement (already given) as the classical signifier of an innate, already-mastered skill or talent carried into this life; Ketu classically represents that regardless of whether a separate yoga also confirms it.";
const HOOK_RULE =
  'Every section also returns "hook": ONE short, striking sentence (max 14 words) in second person that makes the reader want to read that section. It is a pull-quote, not a summary — concrete and specific to THIS chart, never a generic teaser like "Discover your karmic path". No question marks, no hype, no emoji.';
/**
 * This section describes a REAL person's REAL past, which is a categorically different
 * claim from the rest of this report — everything else is classical symbolism about an
 * unverifiable past life, where tendency language is enough. Here a reader can check what
 * we say against what actually happened to them, so the rules are harder: the model may
 * describe the CLIMATE of a period, never assert an EVENT. It has a dasha lord and a
 * strength score; it does not know whether anyone died, fell ill, married or lost a job,
 * and a lucky guess presented as knowledge would be far worse than a vague sentence.
 */
const LIFE_SO_FAR_RULE =
  'The "Your Life So Far" period list below is a GIVEN FACT: the real, already-lived chapters of THIS life, computed from the Vimshottari dasha. Write one short paragraph per period, in order, each opening with the age range so the reader can locate themselves. Describe the CLIMATE of each chapter — what it classically tends to ask of a person, what tends to feel heavy, what tends to open up — and explicitly invite recognition ("you may recognise this as the stretch when…"). ABSOLUTE LIMITS: never assert that a specific event happened. No deaths, illnesses, accidents, births, marriages, divorces, job losses or financial events may be stated as fact — you do not know them. Never diagnose. Never say "you suffered X" or "you achieved X"; say what the period tended to bring and let the reader match it. Favorable/mixed/challenging is the given tone for each period — respect it, and describe a challenging chapter with compassion and without alarm.';
const SOUL_LESSON_RULE =
  'Rahu\'s house/sign is classically read as unfinished karmic business — work the soul did not complete in a previous life and must continue in this one, distinct from Ketu\'s already-mastered/released theme. Frame it that way explicitly. Then, synthesizing Rahu, Ketu, and the karmic archetype theme together, state ONE clear, plainly-worded "core soul lesson" for this lifetime — a single sentence a reader could actually remember, not a vague restatement of the axis.';

function narrativeSystemPrompt(): string {
  return `You are writing a Past Life Report for a mobile Vedic astrology app, grounded in the classical Rahu/Ketu axis. The app already computed Rahu's house/sign, Ketu's house/sign, the 12th-lord's strength, any planets conjunct Rahu or Ketu ("karmic amplifiers"), a house-axis karmic archetype theme, a Kaal Sarp Dosha check, and any favorable yoga present. Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}
${ARCHETYPE_RULE}
${SHASHTIAMSHA_RULE}
${KAAL_SARP_RULE}
${YOGA_RULE}
${SOUL_LESSON_RULE}
${LIFE_SO_FAR_RULE}
${HOOK_RULE}

Frame it exactly like this: Rahu = what you are pulled toward and still learning in this life (an unfamiliar, growth-oriented direction); Ketu = what you have already mastered and are releasing (an innate, over-familiar skill from the past). Tie both to the SPECIFIC houses/signs given — do not give a generic Rahu/Ketu explanation that ignores the specific placements.

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "hook": string, "paragraphs": string[]}]}

Write EXACTLY 4 sections, in this order:
1. Heading close to "Your Karmic Pattern", with 3-5 paragraphs: (a) what Rahu's specific house/sign suggests you're being pulled toward, and how that same unfamiliar pull can also be the root of your deepest fears or blocks in this life (an unfamiliar direction often surfaces as anxiety before it matures into growth), (b) what Ketu's specific house/sign suggests you've already mastered/are releasing, including why certain people, places, or skills tied to that house/sign theme can feel instantly, inexplicably familiar, AND a brief, light narrative sketch (one clause, not a separate claim) of what kind of life or role your soul most likely lived before in classical terms (e.g. a caretaker, a builder, a seeker) matching that same house/sign theme — this directly answers "what kind of life did my soul most likely live before this one," so don't skip it, (c) how the 12th-lord's strength colors this (12th house = past-life/release themes), (d) if there are any conjunct planets, one paragraph on how they amplify or complicate this axis — including any extra weight they add to the fears/blocks theme from (a) — omit this paragraph entirely if the conjunct list is empty, (e) a paragraph naming a specific past-life talent or skill classically carried forward into this birth, per YOGA_RULE (favorable yoga if present, otherwise the Ketu-placement fallback — never omit this paragraph). Each paragraph 2-4 sentences.
2. Heading close to "Your Karmic Axis Theme" — 1-2 short paragraphs: the given karmic archetype label/description as the overarching theme for this axis (per ARCHETYPE_RULE) plus the Shashtiamsha (D60) color (per SHASHTIAMSHA_RULE), and the Kaal Sarp Dosha note if present (per KAAL_SARP_RULE). If Kaal Sarp is not present, this section can be just the archetype theme alone.
3. Heading close to "Your Unfinished Business & Soul Lesson" — 2 paragraphs per SOUL_LESSON_RULE: first, Rahu's placement framed explicitly as unfinished karmic business carried into this life; second, the single, memorable core soul lesson synthesized from Rahu, Ketu, and the karmic archetype together.
4. Heading close to "Your Life So Far" — one short paragraph per given period, in order, per LIFE_SO_FAR_RULE, then ONE closing paragraph tying the whole lived arc back to the karmic axis (what this life has been asking of you so far). If the period list below is empty, OMIT THIS SECTION ENTIRELY and write only 3 sections — never invent periods.

Second person ("you") throughout.`;
}

function buildFacts(scores: PastLifeScores): string {
  const lines: string[] = [];
  lines.push(`Rahu: house ${scores.rahuHouse ?? 'unknown'}, sign ${scores.rahuSign ?? 'unknown'}.`);
  lines.push(`Ketu: house ${scores.ketuHouse ?? 'unknown'}, sign ${scores.ketuSign ?? 'unknown'}.`);
  lines.push(`12th-lord strength: ${scores.twelfthLordStrength}.`);
  lines.push(
    scores.conjunctPlanets.length > 0
      ? `Planets conjunct Rahu or Ketu (karmic amplifiers): ${scores.conjunctPlanets.join(', ')}.`
      : 'No planets conjunct Rahu or Ketu.',
  );
  lines.push(
    `Karmic archetype (house-axis theme): "${scores.karmicArchetype.label}" — ${scores.karmicArchetype.description}`,
  );
  const shashtiamsha = scores.vargas?.[0];
  lines.push(
    shashtiamsha
      ? `Shashtiamsha (D60 — overall karmic destiny chart): ${formatReportVarga(shashtiamsha)}.`
      : 'Shashtiamsha (D60): unavailable on this chart.',
  );
  lines.push(
    scores.doshaYoga.cautions.length > 0
      ? `Kaal Sarp Dosha: present — ${scores.doshaYoga.cautions.map((c) => c.detail).join('; ')}.`
      : 'Kaal Sarp Dosha: not present.',
  );
  lines.push(
    scores.doshaYoga.positives.length > 0
      ? `Favorable yoga present (classically read as a carried-forward past-life talent/skill): ${scores.doshaYoga.positives.map((p) => `${p.label}: ${p.detail}`).join('; ')}.`
      : 'No specifically-checked favorable yoga is present on this chart.',
  );
  lines.push(
    scores.lifeSoFar.length > 0
      ? `Your Life So Far — the already-lived chapters of THIS life (each is a Vimshottari Mahadasha, clipped to birth..today), in order:\n${scores.lifeSoFar
          .map((b) => `  - ${b.label}: ${b.tone}.`)
          .join('\n')}`
      : 'Your Life So Far: unavailable on this chart — OMIT the "Your Life So Far" section entirely.',
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
          hook: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
        },
        // `hook` is deliberately NOT required: a response that omits it is still a
        // perfectly good report, and failing the whole (paid, refund-on-failure)
        // generation over a missing pull-quote would trade the content for the garnish.
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
      const e = entry as { heading?: unknown; hook?: unknown; paragraphs?: unknown };
      if (typeof e.heading !== 'string' || !e.heading.trim()) continue;
      if (!Array.isArray(e.paragraphs)) continue;
      const paragraphs = e.paragraphs.filter(
        (p): p is string => typeof p === 'string' && p.trim().length > 0,
      );
      if (paragraphs.length === 0) continue;
      // Optional (see SECTIONS_SCHEMA) — omitted entirely when absent or blank, so
      // `hook` is never an empty string the renderer would draw an empty pull-quote for.
      const hook = typeof e.hook === 'string' && e.hook.trim() ? e.hook.trim() : undefined;
      sections.push({ heading: e.heading.trim(), ...(hook ? { hook } : {}), paragraphs });
    }
    return sections.length > 0 ? sections : null;
  } catch {
    return null;
  }
}

/** Exactly 1 bounded call — this is the thinnest-margin report in the catalogue by design. */
export async function generatePastLifeNarrative(scores: PastLifeScores): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      { role: 'system', content: narrativeSystemPrompt() },
      reportFactsMessage(buildFacts(scores), scores.planetCondition, scores.vakriFacts),
      { role: 'user', content: 'Write the Past Life report narrative.' },
    ],
  });

  const parsed = parseSections(raw);
  if (!parsed) {
    void import('../../logger.js').then((m) =>
      m.logger.error({ raw }, 'unparseable JSON in past life report narrative'),
    );
    throw new Error('past life report LLM returned unparseable JSON');
  }
  return parsed;
}

export async function translatePastLifeNarrative(
  sections: ReportSection[],
  targetLanguage: string,
): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_TRANSLATION_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      {
        role: 'user',
        content: `Translate the following report sections into the language "${targetLanguage}". Keep the exact same JSON structure ({"sections": [{"heading": string, "hook": string, "paragraphs": string[]}]}) and the same number of sections and paragraphs. "hook" is a short pull-quote sentence — translate it too, and keep it short; omit the key for any section that does not have one. ONLY translate the human-readable text.\n\nOriginal Content:\n${JSON.stringify({ sections }, null, 2)}`,
      },
    ],
  });

  const parsed = parseSections(raw);
  if (!parsed) {
    throw new Error(
      `past life report translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
  return parsed;
}
