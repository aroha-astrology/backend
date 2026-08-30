// =============================================================================
// Marriage report — LLM narrative
// =============================================================================
// Turns the deterministic MarriageScores into narrative prose across 4 bounded
// calls (comfortably under REPORT_PROFILE's 4096-token ceiling each — same
// discipline as the original 2-call version, just extended to cover the
// larger fact surface the report now carries): call 1 covers band/Manglik +
// marriage timing (2 sections), call 2 covers the 7th-house
// temperament/archetype + family/in-laws (2 sections), call 3 covers
// money-after-marriage + the dosha/yoga summary (2 sections), call 4 covers
// modern realities only (1 section — the marriage-quality-by-decade section
// was removed). No fallback filler on a bad response — same discipline as
// generateKundliMilanNarrative: an unparseable response throws so the
// orchestration layer marks the row failed and refunds, rather than caching
// generic text.
// =============================================================================

import { generate } from '../gemini-client.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE } from '../../../config/llm.js';
import { cleanJsonString } from '../horoscope.js';
import { GROUNDING_RULE as HOUSE_GROUNDING_RULE, PLAIN_LANGUAGE_RULE } from '../house-insight.js';
import { formatReportVarga } from '../../astro-engine/reports/report-vargas.js';
import type { MarriageScores } from '../../astro-engine/reports/marriage.js';
import type { RankedWindow } from '../../astro-engine/reports/report-timing.js';
import type { AgeBand } from '../../astro-engine/reports/report-age-bands.js';
import type { PlanetStrengthRow } from '../../chat-grounding.js';
import type {
  ReportSection,
  SectionGenerationProgress,
} from '../../../modules/reports/report-generator.types.js';
import { reportFactsMessage } from './report-facts-message.js';

/** `planetStrength` is bolted onto every report's `scores` centrally (reports.service.ts's
 * `computeScoresWithCondition`, right after `computeScores` returns) rather than being part of
 * `MarriageScores` itself — same pattern as `planetCondition`. It IS present by the time
 * `generateMarriageNarrative` runs. */
type MarriageScoresWithStrength = MarriageScores & { planetStrength?: PlanetStrengthRow[] };

const GROUNDING_RULE =
  "Every score, label, date, house sign, trait-tilt number, and dosha/yoga fact below is a GIVEN FACT, already computed by a deterministic classical Vedic algorithm — the SAME algorithm the app's AI chat feature uses for its own timing answers about this exact chart. State these facts verbatim in your prose. Never recompute, second-guess, round differently, invent a new number, or contradict any of them — your job is ONLY to explain what they mean in plain language.";
const SAFETY_RULE =
  'This is advisory guidance for reflection, never a guarantee about if or when marriage will happen, and never a substitute for the reader\'s own judgment and choices. Use tendency language ("suggests", "classically associated with", "tends to"), never absolute predictions. Do not recommend specific remedies, pujas, or purchases — the app does not sell those here.';
const TONE_RULE =
  'Tone: encouraging but honest — never falsely reassuring, never alarmist. If the band is "slow_build", frame it as patience and groundwork rather than a problem; if "accelerated", frame it as genuine momentum without overpromising a date.';
/** The "uiData" object's schema is shared across all 4 narrative calls (every possible field from
 * every call is declared on it, all required-but-nullable — see UI_DATA_PROPERTIES's own doc
 * comment for why "required" is non-negotiable under strict structured output). Each call only
 * OWNS a handful of those fields; this line is what tells the model to null out the rest rather
 * than leaving them unfilled (which strict mode would reject) or inventing content for a field
 * that belongs to a different call. */
const UI_DATA_NULL_RULE =
  'The "uiData" object\'s schema spans fields belonging to ALL FOUR calls of this narrative — this call only owns the field(s) named in the instructions above. Set every OTHER field in that schema to null. Never invent content for a field you do not own here, and never leave null a field you do own.';

function formatWindow(window: { startDate: string; endDate: string } | null): string {
  if (!window) return 'none identified';
  const start = new Date(window.startDate).toISOString().slice(0, 7);
  const end = new Date(window.endDate).toISOString().slice(0, 7);
  return `${start} to ${end}`;
}

function formatWindows(windows: RankedWindow[]): string {
  if (windows.length === 0) {
    return 'none identified — the chart data does not support a specific timing answer right now; state this plainly rather than inventing a date.';
  }
  return windows
    .map(
      (w, i) =>
        `${i === 0 ? 'Strongest window' : `Next window ${i + 1}`}: ${formatWindow(w)} (confidence: ${w.level}, dasha depth: ${w.dashaLevel}).`,
    )
    .join(' ');
}

function formatAgeBands(bands: AgeBand[]): string {
  if (bands.length === 0) return 'unavailable — birth date could not be derived from the chart.';
  return bands.map((b) => `Age ${b.label}: ${b.confidence}`).join('; ');
}

function narrativeSystemPromptCall1(): string {
  return `You are writing the opening section of a Marriage Report for a mobile Vedic astrology app. The app already computed a marriage score, a band classification, Manglik Dosha status, a ranked set of favorable timing windows, an age-based confidence table, and Jupiter's own supplementary timing window using classical rules. Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}
${TONE_RULE}

CRITICAL — check the given relationship status before writing anything about timing: if it is "married", "divorced", or "widowed", this person already has (or had) a marriage — do NOT predict if/when they "will" get married. Instead frame the score/band/timing windows as describing the marriage-relevant period(s) this chart's own patterns highlight (useful for understanding the relationship's ups and downs, not a first-marriage countdown); if "divorced" or "widowed", also do not imply their current status is temporary. If the status is "single", "in_relationship", "engaged", or not given at all, write normally about if/when marriage may happen, as before.

If facts about the reader's real spouse (a Guna Milan compatibility score and the spouse's own Manglik status) are given below, this reader is already married and supplied their spouse's chart — weave those facts into section 1 as an added, corroborating layer on top of the existing band/Manglik discussion (use the spouse's name if given, instead of the generic "your spouse"), rather than a separate topic.

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[], "uiData": object}]}

Write EXACTLY 2 sections, in this order:
1. Heading close to "At A Glance" — 1-2 paragraphs stating the band given (do NOT state the underlying numeric score), explaining what the band means in plain language (e.g. a "slow_build" band means the groundwork is still forming, not that marriage won't happen), and mentioning the Manglik status given (including what a cancellation means in plain terms, if cancelled).
2. Heading close to "Marriage Timing" — 1-3 paragraphs about the given timing windows (or their absence — if none were found, say so plainly, never invent a date), the age-based confidence table (explain it as "here's roughly when the chart's own patterns look strongest, by your age," not a guarantee), and Jupiter's own supplementary window as clearly separate, secondary color (Jupiter is a classical marriage/dharma significator, but its own window is NOT a second competing prediction — frame the primary windows as the headline answer). Do not invent a specific date beyond the month/year range given. Apply the relationship-status framing rule above throughout. If a Planet Strength table is given below, you MUST ALSO include a "uiData" object on THIS section (section 2) with a string field per planet in that table, keyed EXACTLY as "planetStrength_" followed by the planet's name in lowercase (e.g. "planetStrength_saturn"): a 1-2 line explanation of what that planet's given strength percentage and any retrograde/combust flag mean in plain language, tied to that planet's classical significations (e.g. Saturn → discipline/endurance, Moon → emotional stability, Mercury → communication) rather than marriage specifically, since this table covers the whole chart. Omit the uiData object entirely if no Planet Strength table is given. ${UI_DATA_NULL_RULE}

Write in a clear, natural style. Second person ("you").`;
}

function narrativeSystemPromptCall2(): string {
  return `You are writing the second section of a Marriage Report for a mobile Vedic astrology app. The app already computed the 7th house sign (partnership house) and its classical temperament association, the Navamsa (D9) chart — the classical marriage/spouse/inner-strength varga, read ALONGSIDE the D1 7th house, never in place of it — a partner archetype with 5 trait-tilt scores, why the 7th-lord/Venus/Jupiter are strong or weak, and the 4th-lord strength (family/home significator) plus an in-laws note. Your job is ONLY to write the narrative explanation.

${HOUSE_GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}

If facts about the reader's real spouse (their own Navamsa and synastry reads for harmony/in-laws) are given below, reframe section 1 from "who you will marry" speculation to "who your spouse is" — weave in the spouse's own Navamsa and the given harmony synastry read as corroborating, real-chart evidence rather than generic archetype lore, and weave the given in-laws synastry read into section 2 alongside the existing 4th-lord fact. Use the spouse's name if given.

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[], "uiData": object}]}

Write EXACTLY 2 sections, in this order:
1. Heading close to "Who You Will Marry" — 2-4 paragraphs sketching general values/temperament qualities associated with the 7th house sign and the given partner archetype's trait tilts. Weave in the specific reasons given for the 7th-lord, Venus, and Jupiter strengths. Mention the given Navamsa Lagna and house placements of Venus and Jupiter. If the Ashtakavarga summary flags the 7th house, weave that in. Explicitly frame this as classical sign-quality lore/tendency, NOT a specific prediction about a real individual. You MUST ALSO include a "uiData" object on this section with these string fields filled in: "planetImpact_seventhLord" (a 1-3 line explanation of its meaning, strength, and impact), "planetImpact_venus" (1-3 lines), "planetImpact_jupiter" (1-3 lines), and "seventhHouseImpact" (1-3 lines). ${UI_DATA_NULL_RULE}
2. Heading close to "Family & In-Laws" — 1-2 paragraphs on family/in-law harmony grounded in the 4th-lord strength and in-laws note given.

Write in a clear, natural style. Second person ("you").`;
}

function narrativeSystemPromptCall3(): string {
  return `You are writing the third section of a Marriage Report for a mobile Vedic astrology app. The app already computed a "money after marriage" fact (from the 2nd and 11th house signs) and a dosha/yoga summary (favorable yogas present, and doshas needing awareness). Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}

If wealth and/or career synastry reads for the reader's real spouse are given below, weave them into the "Money After Marriage" section as real-couple evidence, alongside the existing 2nd/11th house facts.

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[], "uiData": object}]}

Write EXACTLY 2 sections, in this order:
1. Heading close to "Money After Marriage" — 1-3 paragraphs on how finances are classically read to shift after marriage, grounded in the given 2nd/11th house facts.
2. Heading close to "What's Going For You" (covering the given favorable yogas) followed within the SAME section by a second paragraph on "What To Hold Carefully" (covering the given cautions/doshas), explicitly framed as what to stay mindful of especially in the early years after the wedding. If a Remedies list is given below, you MUST ALSO include a "uiData" object on this section with, for EACH remedy planet given, two string fields filled in, keyed EXACTLY as "remedyEffect_" and "remedyDuration_" followed by that planet's name in lowercase (e.g. "remedyEffect_venus", "remedyDuration_venus"): "remedyEffect_<planet>" is a 1-2 line explanation of what performing THAT SPECIFIC already-given remedy is classically believed to strengthen for this person's marriage, tied to that planet's role (e.g. Venus → love/harmony, Jupiter → blessings/growth); "remedyDuration_<planet>" is one short, practical guideline for how long or how often to continue it (e.g. "Continue for at least 40 Fridays" or "Every Thursday for about 4 months"), matching the remedy's own weekday if it names one. Explaining an already-given remedy's effect and duration here is your job, not a new recommendation — never suggest a different remedy, puja, gemstone or purchase than the one given. Omit the uiData object entirely if no Remedies list is given. ${UI_DATA_NULL_RULE}

Write in a clear, natural style. Second person ("you").`;
}

function narrativeSystemPromptCall4(): string {
  return `You are writing the closing section of a Marriage Report for a mobile Vedic astrology app. The app already computed a set of "modern realities" facts: whether this chart's OWN timing data itself skews toward a later marriage age, Rahu's natal house, and how many planets occupy the 7th house. Your job is ONLY to write the narrative explanation.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}

If additional synastry reads for the reader's real spouse (children, timing, intimacy, health) are given below, weave them into the "Modern Realities" section as a closing, real-couple layer alongside the existing tendencies.

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[], "uiData": object}]}

Write EXACTLY 1 section:
1. Heading close to "Modern Realities" — 1-2 paragraphs using STRICT tendency language (never "you will marry late," always something like "this chart's own timing pattern tends to favor a later window" — and only mention this at all if the given fact says it is true), the Rahu house note (framed as a tendency toward distance/foreign connection in partnership, not a certainty), and the 7th-house planet count (framed as a tendency toward a busier or more complex partnership dynamic if the count is above 2, otherwise skip that point rather than force it).

Write in a clear, natural style. Second person ("you").`;
}

function buildFactsCall1(scores: MarriageScoresWithStrength): string {
  const lines: string[] = [];
  lines.push(
    `Reader's current relationship status: ${scores.relationshipStatus ?? 'not provided'}.`,
  );
  // Given fact, already banded deterministically (marriage.ts) from the same tilt formula the
  // True Love Report uses — the screen renders it as its own card, so the narrative must agree
  // with it rather than reach an independent conclusion about love vs arranged.
  lines.push(
    `Route to marriage this chart leans toward (GIVEN, do not contradict): ${scores.loveOrArrange ?? 'mixed'} (love = self-chosen, arrange = family-introduced, mixed = a blend).`,
  );
  lines.push(`Marriage score: ${scores.marriageScore} out of 100.`);
  lines.push(`Band: ${scores.band}.`);
  lines.push(
    `Manglik (Mangal Dosha): ${scores.manglik.isManglik ? 'present' : 'not present'}` +
      (scores.manglik.isManglik
        ? `, classically cancelled: ${scores.manglik.cancelled ? 'yes' : 'no'}`
        : '') +
      '.',
  );
  lines.push(
    `Marriage timing windows (7th-house-lord/7th-house-occupants/Venus dasha overlap — the SAME method the app's AI chat feature uses for this exact chart): ${formatWindows(scores.windows)}`,
  );
  lines.push(
    `Age-based confidence table (strongest timing confidence starting in each age range): ${formatAgeBands(scores.ageBands)}.`,
  );
  lines.push(
    `Jupiter's own separate dasha window (supplementary dharma/marriage-karaka color only — NOT a second, competing timing answer): ${formatWindow(scores.jupiterDharmaWindow)}.`,
  );
  if (scores.spouseSynastry) {
    lines.push(
      `SPOUSE DATA PROVIDED — this reader is married and supplied their real spouse's birth details. Guna Milan compatibility: ${scores.spouseSynastry.gunaMilanScore}/${scores.spouseSynastry.gunaMaxScore} (${scores.spouseSynastry.compatibilityBand}). Spouse's own Manglik status: ${scores.spouseSynastry.manglikStatus.spouse ? 'present' : 'not present'}${scores.spouseSynastry.manglikStatus.spouse ? `, classically cancelled: ${scores.spouseSynastry.manglikStatus.cancelled ? 'yes' : 'no'}` : ''}.${scores.spouseName ? ` Spouse's name: ${scores.spouseName}.` : ''}`,
    );
  }
  if (scores.planetStrength && scores.planetStrength.length > 0) {
    lines.push(
      `Planet Strength table (Shadbala, whole-chart, not marriage-specific): ${scores.planetStrength
        .map(
          (p) =>
            `${p.planet}: ${p.pct}% (${p.isStrong ? 'strong' : 'below par'}${p.isRetrograde ? ', retrograde' : ''}${p.isCombust ? ', combust' : ''})`,
        )
        .join('; ')}.`,
    );
  }
  return lines.join('\n');
}

function buildFactsCall2(scores: MarriageScores): string {
  const lines: string[] = [];
  lines.push(`7th house sign: ${scores.seventhHouseSign ?? 'unavailable'}.`);
  lines.push(`Classical temperament association for this sign: ${scores.seventhHouseTemperament}.`);
  const navamsa = scores.vargas?.[0];
  lines.push(
    navamsa
      ? `Navamsa (D9 — marriage/spouse/inner-strength chart): ${formatReportVarga(navamsa)}.`
      : 'Navamsa (D9): unavailable on this chart.',
  );
  lines.push(
    `7th-lord (${scores.seventhLord ?? 'unavailable'}) strength: ${scores.seventhLordStrength} — ${scores.seventhLordReason}`,
  );
  lines.push(
    `Venus strength: ${scores.venusStrength} — ${scores.venusReason} (Venus's own natal house: ${scores.venusHouse ?? 'unavailable'}).`,
  );
  lines.push(
    `Jupiter strength: ${scores.jupiterStrength} — ${scores.jupiterReason} (Jupiter's own natal house: ${scores.jupiterHouse ?? 'unavailable'}).`,
  );
  lines.push(`Partner archetype label: ${scores.partnerArchetype.label}.`);
  lines.push(`Partner archetype description: ${scores.partnerArchetype.description}`);
  lines.push(
    `Trait tilts (0-10 scale, backed by classical planetary strength): ${scores.partnerArchetype.traits
      .map((t) => `${t.label}: ${t.score}`)
      .join(', ')}.`,
  );
  lines.push(`4th-lord strength (family/home): ${scores.fourthLordStrength}.`);
  lines.push(
    `In-laws note (4th house sign: ${scores.inLaws.fourthHouseSign ?? 'unavailable'}): ${scores.inLaws.note}`,
  );
  if (scores.spouseSynastry) {
    const spouseNavamsa = scores.spouseSynastry.spouseNavamsa[0];
    lines.push(
      `SPOUSE DATA PROVIDED. Spouse's Navamsa (D9): ${spouseNavamsa ? formatReportVarga(spouseNavamsa) : 'unavailable on the spouse chart'}.`,
    );
    const harmony = scores.spouseSynastry.riskFactors.find((f) => f.key === 'harmony');
    const inlaws = scores.spouseSynastry.riskFactors.find((f) => f.key === 'inlaws');
    if (harmony) lines.push(`Harmony synastry read (GIVEN): ${harmony.severity} — ${harmony.evidence.join('; ')}`);
    if (inlaws) lines.push(`In-laws synastry read (GIVEN): ${inlaws.severity} — ${inlaws.evidence.join('; ')}`);
  }
  if (scores.ashtakavargaSummary && scores.ashtakavargaSummary.length > 0) {
    lines.push(
      "Ashtakavarga house-strength summary (GIVEN — mention the 7th house's own reading only if it stands out as notably strong or weak, otherwise skip):",
    );
    lines.push(...scores.ashtakavargaSummary);
  }
  return lines.join('\n');
}

function buildFactsCall3(scores: MarriageScores): string {
  const lines: string[] = [];
  lines.push(
    `Money after marriage — 2nd house sign: ${scores.moneyAfterMarriage.secondHouseSign ?? 'unavailable'}; 11th house sign: ${scores.moneyAfterMarriage.eleventhHouseSign ?? 'unavailable'}. ${scores.moneyAfterMarriage.note}`,
  );
  const positives =
    scores.doshaYoga.positives.length > 0
      ? scores.doshaYoga.positives.map((p) => `${p.label}: ${p.detail}`).join('; ')
      : 'none of the specifically checked favorable yogas are present';
  const cautions =
    scores.doshaYoga.cautions.length > 0
      ? scores.doshaYoga.cautions.map((c) => `${c.label}: ${c.detail}`).join('; ')
      : 'none of the specifically checked doshas are present';
  lines.push(`What's going for you (present favorable yogas): ${positives}.`);
  lines.push(`What to hold carefully (present doshas needing awareness): ${cautions}.`);
  if (scores.spouseSynastry) {
    const wealth = scores.spouseSynastry.riskFactors.find((f) => f.key === 'wealth');
    const career = scores.spouseSynastry.riskFactors.find((f) => f.key === 'career');
    if (wealth) lines.push(`SPOUSE DATA PROVIDED. Wealth synastry read (GIVEN): ${wealth.severity} — ${wealth.evidence.join('; ')}`);
    if (career) lines.push(`Career synastry read (GIVEN): ${career.severity} — ${career.evidence.join('; ')}`);
  }
  if (scores.planetRemedies && scores.planetRemedies.length > 0) {
    lines.push(
      `Remedies already recommended elsewhere on this report (one per planet — explain effect+duration for THIS exact remedy in uiData, do not invent a different one): ${scores.planetRemedies
        .map((r) => `${r.planet} (house ${r.house}): "${r.remedies[0]}"`)
        .join('; ')}.`,
    );
  }
  return lines.join('\n');
}

function buildFactsCall4(scores: MarriageScores): string {
  const lines: string[] = [];
  lines.push(
    `Modern realities — does this chart's own timing data itself skew toward a later marriage age: ${scores.modernRealities.lateMarriageLeaning ? 'yes' : 'no'}.`,
  );
  lines.push(`Rahu's natal house: ${scores.modernRealities.rahuHouse ?? 'unavailable'}.`);
  lines.push(
    `Number of natal planets occupying the 7th house: ${scores.modernRealities.seventhHousePlanetCount}.`,
  );
  if (scores.spouseSynastry) {
    const remainingKeys: ReadonlyArray<(typeof scores.spouseSynastry.riskFactors)[number]['key']> = [
      'children',
      'timing',
      'intimacy',
      'health',
    ];
    const rest = scores.spouseSynastry.riskFactors.filter((f) => remainingKeys.includes(f.key));
    if (rest.length > 0) {
      lines.push('SPOUSE DATA PROVIDED. Additional synastry reads (GIVEN):');
      for (const f of rest) lines.push(`- ${f.key}: ${f.severity} — ${f.evidence.join('; ')}`);
    }
  }
  return lines.join('\n');
}

/** The 9 classical grahas — every planet name a remedy/strength uiData key can ever be suffixed
 * with.
 *
 * Two live-verified fixes layered here, both against the SAME symptom (every uiData-bearing
 * section on a real generated report came back `{}`/`[]`, never the requested fields, despite the
 * prompt asking for them and every unit test — which only exercises fixture strings, never the
 * real API — still passing):
 *
 * 1. Gemini's strict structured-output mode (an OpenAI-compatible json_schema contract, see
 *    gemini-client.ts's doRequest) cannot populate a bare `{type: 'object'}` with unknown/dynamic
 *    keys — without declared `properties` there is no valid key for guided decoding to emit.
 *    Fixed by enumerating every possible key explicitly below.
 *
 * 2. That alone was NOT enough (still empty after redeploying): true OpenAI-style `strict: true`
 *    schemas require EVERY declared property to also appear in `required` — a property that is
 *    merely declared but left out of `required` is apparently never populated by guided decoding
 *    at all, not just "populated when the model feels like it". "Optional" is expressed instead by
 *    a nullable type (`["string", "null"]`), which is what STRING_OR_NULL does below — every key is
 *    always present in a real response, null for whichever ones a given call has nothing to say. */
const STRING_OR_NULL = { type: ['string', 'null'] } as const;

const GRAHAS = [
  'sun',
  'moon',
  'mars',
  'mercury',
  'jupiter',
  'venus',
  'saturn',
  'rahu',
  'ketu',
] as const;

const UI_DATA_PROPERTIES = {
  planetImpact_venus: STRING_OR_NULL,
  planetImpact_jupiter: STRING_OR_NULL,
  planetImpact_seventhLord: STRING_OR_NULL,
  seventhHouseImpact: STRING_OR_NULL,
  ...Object.fromEntries(
    GRAHAS.flatMap((p) => [
      [`remedyEffect_${p}`, STRING_OR_NULL],
      [`remedyDuration_${p}`, STRING_OR_NULL],
      [`planetStrength_${p}`, STRING_OR_NULL],
    ]),
  ),
} as const;

const UI_DATA_REQUIRED = Object.keys(UI_DATA_PROPERTIES);

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
          uiData: {
            type: 'object',
            properties: UI_DATA_PROPERTIES,
            required: UI_DATA_REQUIRED,
          },
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
      const e = entry as { heading?: unknown; paragraphs?: unknown; uiData?: unknown };
      if (typeof e.heading !== 'string' || !e.heading.trim()) continue;
      if (!Array.isArray(e.paragraphs)) continue;
      const paragraphs = e.paragraphs.filter(
        (p): p is string => typeof p === 'string' && p.trim().length > 0,
      );
      if (paragraphs.length === 0) continue;

      const section: ReportSection = { heading: e.heading.trim(), paragraphs };
      if (typeof e.uiData === 'object' && e.uiData !== null && !Array.isArray(e.uiData)) {
        // Every call's uiData object carries ALL sibling calls' fields too, most of them null
        // (see UI_DATA_NULL_RULE) — strip those before persisting so the stored content only ever
        // holds what this section actually has something to say about.
        const cleaned = Object.fromEntries(
          Object.entries(e.uiData as Record<string, unknown>).filter(
            ([, v]) => v !== null && !(Array.isArray(v) && v.length === 0),
          ),
        );
        if (Object.keys(cleaned).length > 0) section.uiData = cleaned;
      }
      sections.push(section);
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
  vakri: string[] | undefined,
  label: string,
): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      { role: 'system', content: systemPrompt },
      reportFactsMessage(facts, condition, vakri),
      { role: 'user', content: 'Write this part of the Marriage Report narrative.' },
    ],
  });

  const parsed = parseSections(raw);
  if (!parsed) {
    void import('../../logger.js').then((m) =>
      m.logger.error({ raw, label }, 'unparseable JSON in marriage report narrative'),
    );
    throw new Error(`marriage report LLM returned unparseable JSON (${label})`);
  }
  return parsed;
}

/**
 * 4 bounded calls — see module doc comment for the split rationale. Each call is independent
 * (built only from `scores`, never from an earlier call's output), so each is independently
 * resumable: `progress.existingGroups[i]`, if present, is reused as-is instead of re-calling
 * Gemini for that part, and a freshly-made part is checkpointed via `progress.onGroupComplete`
 * the instant it succeeds — so a failure on, say, call 3 doesn't discard calls 1 and 2 on retry.
 */
export async function generateMarriageNarrative(
  scores: MarriageScores,
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
    const group = await callAndParse(
      systemPrompt,
      facts,
      scores.planetCondition,
      scores.vakriFacts,
      label,
    );
    await progress?.onGroupComplete(group);
    return group;
  }

  const part1 = await callOrResume(
    0,
    narrativeSystemPromptCall1(),
    buildFactsCall1(scores),
    'call1',
  );
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
  const part4 = await callOrResume(
    3,
    narrativeSystemPromptCall4(),
    buildFactsCall4(scores),
    'call4',
  );
  return [...part1, ...part2, ...part3, ...part4];
}

/** Translate an already-generated (concatenated) section list — one call, same idiom as
 * translateKundliMilanNarrative. Shape-agnostic: works over whatever number of sections
 * `generateMarriageNarrative` produced (now 7, was 8, was 4), since it only ever round-trips
 * the generic {sections: [{heading, paragraphs}]} shape without assuming a fixed count. */
export async function translateMarriageNarrative(
  sections: ReportSection[],
  targetLanguage: string,
): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_TRANSLATION_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      {
        role: 'user',
        content: `Translate the following report sections into the language "${targetLanguage}". Keep the exact same JSON structure ({"sections": [{"heading": string, "paragraphs": string[], "uiData"?: object}]}) and the same number of sections and paragraphs. ONLY translate the human-readable text. Where a section has a "uiData" object you MUST reproduce it with its keys UNCHANGED (they are code identifiers) and only its string values translated.\n\nOriginal Content:\n${JSON.stringify({ sections }, null, 2)}`,
      },
    ],
  });

  const parsed = parseSections(raw);
  if (!parsed) {
    throw new Error(
      `marriage report translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
  return parsed;
}
