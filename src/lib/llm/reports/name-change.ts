// =============================================================================
// Name Change report — LLM narrative
// =============================================================================
// 1 LLM call, 5 sections. The report is deliberately 80% SPELLING adjustments
// to the name the reader already has (up to 12, at least half of them touching
// only the first name — see astro-engine/names/name-variants.ts) and 20%
// alternative FIRST names (surname kept — see rankNamesForTargets), never a
// full-name replacement. Both lists are given facts: real corpus names already
// verified to hit a target number and already ranked+scored by
// scoreCandidateName, and deterministic spelling edits already validated by
// variantHitsTarget — never proposed or scored by the LLM.
//
// Variants and names render as scored/highlighted cards (`ReportSectionItem[]`),
// not prose paragraphs — the LLM writes short bullet-form benefits per item. No
// fallback filler on a bad response — same discipline as
// generateMarriageNarrative/generateBabyNameNarrative.
//
// Section 2 ("What Changing Your Name Could Bring You") answers the reader's
// most direct question — the concrete, everyday upside — as a bullet list,
// separate from the per-item cards in sections 3 and 4.
// =============================================================================

import { generate } from '../gemini-client.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE } from '../../../config/llm.js';
import { cleanJsonString } from '../horoscope.js';
import { PLAIN_LANGUAGE_RULE } from '../house-insight.js';
import { rankNamesForTargets } from '../../astro-engine/names/name-lookup.js';
import type { NameChangeScores } from '../../astro-engine/reports/name-change.js';
import type { ScoredName } from '../../astro-engine/numerology/name-scoring.js';
import type {
  ReportSection,
  ReportSectionItem,
} from '../../../modules/reports/report-generator.types.js';
import { reportFactsMessage } from './report-facts-message.js';

/**
 * How many alternative FIRST names to present, derived from how many spelling variants the
 * deterministic pass actually produced, so the report holds its 80/20 spelling-to-new-name shape
 * even when a short name yields fewer than the 12 variants asked for. Floor of 2 so the section
 * never degenerates into a single card; ceiling of 3 so it stays a footnote to the spelling
 * section, which is the main event.
 */
function suggestionCount(variantCount: number): number {
  return Math.min(3, Math.max(2, Math.round(variantCount / 4)));
}

const GROUNDING_RULE =
  'Every number below (mulank, bhagyank, pythagorean, chaldean, soul urge, personality, target numbers, alignment status, friendly/enemy numbers, match scores) is a GIVEN FACT, already computed by deterministic Vedic and Chaldean numerology formulas. Every suggested name and spelling variant below is ALSO a GIVEN FACT, already generated and scored by a deterministic algorithm. Never recompute, second-guess, invent a new number or score, or invent a different name or spelling variant than the ones given — your job is ONLY to explain what the alignment means and why each given name/change helps.';
const SAFETY_RULE =
  'This is advisory numerological guidance for reflection, never a guarantee about real-world outcomes, and never a substitute for the reader\'s own judgment. Use tendency language ("suggests", "classically associated with", "tends to"), never absolute predictions. Do not recommend specific remedies, gemstones, pujas, or purchases. This report is about numerological spelling alignment ONLY — it must NOT give legal, immigration, or official-document name-change advice (mention, briefly and once, that changing a name on official documents is a separate real-world process outside this report\'s scope, if suggesting the reader consider any change at all).';
const SPELLING_FOCUS_RULE =
  "This report is about ADJUSTING THE SPELLING of the name the reader already has — mostly their first name. It must NEVER propose that the reader replace their whole name, and must never treat the alternative first names in section 4 as replacing the surname: every one of those already has the reader's own surname attached and is a FIRST-NAME change only. Frame the spelling adjustments as the main recommendation throughout, and the alternative first names as a smaller secondary option for a reader who wants a bigger shift than a spelling tweak.";
const VARIANT_RULE =
  'The spelling variants listed below are GIVEN FACTS — each was already verified by this app\'s own deterministic Chaldean calculation to land on one of the reader\'s target numbers once the FULL name is recalculated, and each is labelled with which part of the name it touches ("first name" or "surname") and the exact edit made. Never invent an extra variant, never drop one, never alter a spelling, and never restate a variant\'s number as anything other than what is given. For EVERY given variant, write exactly 2-3 short bullet phrases (not sentences, not a paragraph) on the practical everyday effect that shift is classically associated with bringing (e.g. steadier finances, clearer communication, calmer relationships, better follow-through). Where the variant only touches the first name, it is worth noting once or twice across the section that it leaves the family name untouched — do not repeat that on every card. Keep bullets concrete and distinct across variants; do not repeat the same benefit wording twice.';
const EMPTY_VARIANTS_RULE =
  'If NO spelling variants are given below (an empty list), say so plainly in that section\'s lead paragraph — the deterministic method did not find a small edit that reaches a target number for this exact name — rather than inventing one, and leave "items" as an empty array for that section. Do not apologize excessively; state it as a neutral fact and reassure the reader that their current name still has the alignment/misalignment reading described above regardless.';

const NAME_SUGGESTION_RULE =
  "The alternative names listed below are GIVEN FACTS — each is a real given name from this app's own corpus, chosen to match the reader's own gender, ALREADY combined with the reader's existing surname, and already verified by deterministic Chaldean calculation to land on one of the reader's target numbers as that full combination, then scored/ranked with given reasons. Never invent an extra name, never drop one, never restate a name's number or score as anything other than what is given, never suggest a name that is not on the list, and never write the name without the surname it is given with. For EVERY given name, write exactly 2 short bullet phrases (not sentences) on the practical everyday effect that name is classically associated with bringing — ground each bullet in the given reasons for that name where possible, worded naturally rather than as a literal restatement. Keep bullets concrete and distinct across names.";
const EMPTY_SUGGESTIONS_RULE =
  'If NO alternative names are given below (an empty list), say so plainly in that section\'s lead paragraph as a neutral fact — the deterministic check found no candidate landing on a target number — and leave "items" as an empty array. Do not invent names to fill the gap.';

const BENEFITS_RULE =
  'Ground every bullet in the given gap between the current name\'s Chaldean number and the given target number(s) — do not invent outcomes unrelated to that gap. Each bullet is ONE short, concrete, everyday outcome phrase (not a sentence, no "you"/"your" needed) — e.g. "Fewer stop-start months on income", "Less friction in negotiations and interviews", "Steadier follow-through on plans". Write 5-6 bullets. Never use vague filler like "positive changes" or "better life".';

function narrativeSystemPrompt(variantCount: number, nameCount: number): string {
  return `You are writing a Name Change (Name Correction) Report for a mobile Vedic astrology app, grounded in Vedic Mulank/Bhagyank numerology cross-checked against Chaldean name numerology. The app already computed the reader's current name's full numerological signature, ${variantCount} deterministic SPELLING variants of that same name (most of them touching only the first name), and ${nameCount} ranked+scored alternative FIRST names that keep the reader's own surname. Your job is ONLY to write the narrative explanation and the short bullet copy for each item.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}
${SPELLING_FOCUS_RULE}
${VARIANT_RULE}
${EMPTY_VARIANTS_RULE}
${NAME_SUGGESTION_RULE}
${EMPTY_SUGGESTIONS_RULE}
${BENEFITS_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[], "bullets"?: string[], "items"?: [{"title": string, "bullets": string[]}]}]}

"items"/"bullets" are only used where specified below; omit them (or use an empty array) elsewhere. Never include a "title" for an item that is not one of the exact given names/variants — do not add badge, score, or note fields, the app fills those in from the given facts, not you.

Write EXACTLY 5 sections, in this order:
1. Heading close to "Your Name's Numerological Signature" — 1-3 paragraphs explaining the given Mulank, Bhagyank, and current name's Chaldean number, the given alignment classification (aligned/partially_aligned/misaligned) and what it means, the given friendly/enemy numbers as classical context, AND explicitly state the given target number(s) this name should ideally add up to (best first) — this is a direct answer to "what number should my name ideally add up to." No bullets or items in this section.
2. Heading close to "What Changing Your Name Could Bring You" — ONE short lead-in paragraph, then a "bullets" array per BENEFITS_RULE. No items in this section.
3. Heading close to "Suggested Spelling Adjustments". ONE short lead-in paragraph (1-2 sentences) saying these spellings all already add up to the reader's target number, that most of them change only the first name, and that the reader keeps the name they already have. If the given variant list is empty, state that instead per EMPTY_VARIANTS_RULE. Then an "items" array, one entry per given variant IN THE GIVEN ORDER, each with "title" set to the exact given variant spelling and "bullets" per VARIANT_RULE. No "paragraphs" beyond the lead-in — this is the main event and the section the reader most wants: small, low-risk spelling shifts to their own name.
4. Heading close to "Suggested Names" — ONE short lead-in paragraph framing this as the bigger, optional step for a reader who wants more than a spelling tweak: a different first name, with their own surname kept, ranked by match. If the given gender used to select these names is "male" or "female", say so plainly in this lead-in (e.g. "matched to names typically given to men/women") so the reader can see which pool the names were drawn from; if it's "unknown", say the search covered names of any gender instead. Then an "items" array, one entry per given alternative name in the given rank order, each with "title" set to the exact given name (including the surname it comes with) and "bullets" per NAME_SUGGESTION_RULE. Keep this section brief — it is a footnote to section 3, not the main event.
5. Heading close to "Practical Guidance" — 1-2 paragraphs, using ONLY the facts already given above, covering: (a) an honest, expectation-setting note on how much realistic difference a spelling change could make — numerology is one classical lens among several, a supportive nudge rather than a guarantee, so frame it as real but modest, not life-changing on its own; (b) a suggestion to phase any change in gradually and informally first (e.g. trying the new spelling in a signature or among close family/friends) before any formal step, briefly reiterating that an official/legal document name change is a separate real-world process outside this report's scope; (c) if the reader chooses to keep their current name as-is, name the given enemy numbers (if any) as the one thing to stay mindful of, tied to the given alignment classification. No bullets or items in this section.

Each lead-in paragraph is 1-2 sentences. Each bullet phrase is short — under 12 words. Second person ("you") in paragraphs; bullets can drop "you/your" for brevity.`;
}

function formatScoredName(n: ScoredName): string {
  return `"${n.name}" -> Chaldean ${n.chaldean}, match score ${n.score}${n.recommended ? ' (top match)' : ''}, reasons: ${n.reasons.join('; ') || 'none'}`;
}

function buildFacts(scores: NameChangeScores, suggestions: ScoredName[]): string {
  const lines: string[] = [];
  const a = scores.alignment;
  lines.push(`Current name: ${scores.currentName}. Date of birth used: ${scores.dob}.`);
  lines.push(`Mulank: ${a.mulank}. Bhagyank: ${a.bhagyank}.`);
  lines.push(
    `Current name's Pythagorean number: ${a.pythagorean}. Chaldean number: ${a.chaldean}.`,
  );
  lines.push(`Soul Urge number: ${a.soulUrge}. Personality number: ${a.personality}.`);
  lines.push(`Target numbers (best first): ${a.targets.join(', ') || 'none available'}.`);
  lines.push(`Alignment classification: ${a.alignment}.`);
  lines.push(`Friendly numbers: ${a.friendly.join(', ') || 'none'}.`);
  lines.push(`Enemy numbers: ${a.enemy.join(', ') || 'none'}.`);
  if (scores.variants.length > 0) {
    lines.push(
      `Suggested spelling variants of this SAME name (write one items entry for every one of these ${scores.variants.length}, in this exact order; each Chaldean number is for the FULL name as spelled): ${scores.variants
        .map((v) => `"${v.variant}" (${v.change}) -> Chaldean number ${v.chaldean}`)
        .join('; ')}.`,
    );
  } else {
    lines.push(
      'Suggested spelling variants: NONE — the deterministic method found no small edit reaching a target number for this exact name.',
    );
  }
  // Computed by computeNameChangeScores as ctx.personGender when stated, else a best-effort
  // guess from the reader's own first name (see inferGenderFromName) — stated here so the
  // model can name which pool the alternative names were drawn from (see NAME_SUGGESTION_RULE),
  // rather than the reader having no way to tell a real gender-corpus mismatch from a bug.
  lines.push(
    `Gender used to select alternative first names: ${scores.gender ?? 'unknown (searched names of any gender)'}.`,
  );
  lines.push(
    suggestions.length > 0
      ? `Alternative FIRST names (the reader's own surname is already included in each one, and each Chaldean number is for that full combination), already ranked best-to-worst by given match score (write one items entry for every one of these ${suggestions.length}, in this exact order): ${suggestions.map(formatScoredName).join('; ')}.`
      : 'Alternative first names: NONE — the deterministic check found no candidate name reaching a target number.',
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
          bullets: { type: 'array', items: { type: 'string' } },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                bullets: { type: 'array', items: { type: 'string' } },
                // Translation pass only — see `translated` in mergeItems. Never on generation.
                note: { type: 'string' },
                badge: { type: 'string' },
              },
              required: ['title', 'bullets'],
            },
          },
        },
        required: ['heading', 'paragraphs'],
      },
    },
  },
  required: ['sections'],
} as const;

/**
 * Merges the LLM's bullet copy for a given item title back onto the given deterministic fact
 * (name/chaldean/score/recommended, or variant/change/chaldean) — the LLM never supplies badge or
 * score itself (see narrativeSystemPrompt's explicit instruction), so a hallucinated or missing
 * title just drops that item rather than fabricating one that wasn't in `known`.
 *
 * `translated` is set ONLY on the translation pass. `note` (the variant's edit description, "first
 * name — replaced \"i\" with \"ee\"") and `badge` ("Chaldean 6") are the two item fields that
 * carry English WORDS rather than a pure computed value, and the frontend renders both verbatim —
 * so without this they stay English on every non-English report. Both fall back to the English
 * original when the model omits them, and `badge` is additionally rejected unless it still carries
 * exactly the same digits, so a translation can never restate the reader's Chaldean number.
 */
function mergeItems(
  raw: unknown,
  known: Map<string, ReportSectionItem>,
  translated = false,
): ReportSectionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ReportSectionItem[] = [];
  for (const entry of raw as unknown[]) {
    const e = entry as { title?: unknown; bullets?: unknown; note?: unknown; badge?: unknown };
    if (typeof e.title !== 'string') continue;
    const base = known.get(e.title.trim().toLowerCase());
    if (!base) continue; // not one of the given facts — drop rather than invent
    const bullets = Array.isArray(e.bullets)
      ? e.bullets.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      : [];
    const note =
      translated && base.note && typeof e.note === 'string' && e.note.trim() ? e.note.trim() : null;
    const badge =
      translated && base.badge && typeof e.badge === 'string' && sameDigits(e.badge, base.badge)
        ? e.badge.trim()
        : null;
    out.push({ ...base, bullets, ...(note ? { note } : {}), ...(badge ? { badge } : {}) });
  }
  return out;
}

/** True when both strings contain the same digits in the same order — the guard that stops a
 * translated badge from restating the reader's Chaldean number as something else. */
function sameDigits(a: string, b: string): boolean {
  const digits = (s: string): string => (s.match(/\d/g) ?? []).join('');
  return digits(a) === digits(b);
}

function parseSections(
  raw: string,
  nameItems: Map<string, ReportSectionItem>,
  variantItems: Map<string, ReportSectionItem>,
  translated = false,
): ReportSection[] | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as { sections?: unknown };
    if (!Array.isArray(data.sections) || data.sections.length === 0) return null;
    const sections: ReportSection[] = [];
    for (const entry of data.sections) {
      const e = entry as {
        heading?: unknown;
        paragraphs?: unknown;
        bullets?: unknown;
        items?: unknown;
      };
      if (typeof e.heading !== 'string' || !e.heading.trim()) continue;
      if (!Array.isArray(e.paragraphs)) continue;
      const paragraphs = e.paragraphs.filter(
        (p): p is string => typeof p === 'string' && p.trim().length > 0,
      );
      const bullets = Array.isArray(e.bullets)
        ? e.bullets.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
        : undefined;
      // A section is either the name-suggestion section or the variant section, never both — try
      // name items first, then variant items, so a section with neither just has no items.
      const byName = mergeItems(e.items, nameItems, translated);
      const items = byName.length > 0 ? byName : mergeItems(e.items, variantItems, translated);
      if (paragraphs.length === 0 && (!bullets || bullets.length === 0) && items.length === 0)
        continue;
      sections.push({
        heading: e.heading.trim(),
        paragraphs,
        ...(bullets && bullets.length > 0 ? { bullets } : {}),
        ...(items.length > 0 ? { items } : {}),
      });
    }
    return sections.length > 0 ? sections : null;
  } catch {
    return null;
  }
}

export async function generateNameChangeNarrative(
  scores: NameChangeScores,
): Promise<ReportSection[]> {
  const suggestions = rankNamesForTargets(
    scores.alignment,
    scores.currentName,
    suggestionCount(scores.variants.length),
    scores.gender,
  );

  const nameItems = new Map<string, ReportSectionItem>(
    suggestions.map((n) => [
      n.name.trim().toLowerCase(),
      {
        title: n.name,
        badge: `Chaldean ${n.chaldean}`,
        score: n.score,
        highlight: n.recommended,
        bullets: [],
      },
    ]),
  );
  const variantItems = new Map<string, ReportSectionItem>(
    scores.variants.map((v) => [
      v.variant.trim().toLowerCase(),
      { title: v.variant, badge: `Chaldean ${v.chaldean}`, note: v.change, bullets: [] },
    ]),
  );

  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      {
        role: 'system',
        content: narrativeSystemPrompt(scores.variants.length, suggestions.length),
      },
      reportFactsMessage(buildFacts(scores, suggestions), scores.planetCondition),
      { role: 'user', content: 'Write the Name Change report narrative.' },
    ],
  });

  const parsed = parseSections(raw, nameItems, variantItems);
  if (!parsed) {
    void import('../../logger.js').then((m) =>
      m.logger.error({ raw }, 'unparseable JSON in name change report narrative'),
    );
    throw new Error('name change report LLM returned unparseable JSON');
  }
  return parsed;
}

export async function translateNameChangeNarrative(
  sections: ReportSection[],
  targetLanguage: string,
): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_TRANSLATION_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      {
        role: 'user',
        content: `Translate the following report sections into the language "${targetLanguage}". Keep the exact same JSON structure ({"sections": [{"heading": string, "paragraphs": string[], "bullets"?: string[], "items"?: [{"title": string, "bullets": string[], "note"?: string, "badge"?: string}]}]}) and the same number of sections, paragraphs, bullets, and items — never add or drop any. Do NOT translate the proper name/spelling variants themselves (keep "title" fields exactly as given), but DO translate "heading", "paragraphs", every "bullets" string (both section-level and item-level), every item "note", and every item "badge".\n\nAn item "badge" reads like "Chaldean 6" — translate the word, but keep the number EXACTLY as given, in the same digits. An item "note" describes a spelling edit, e.g. \`first name — replaced "i" with "ee"\`. Translate the surrounding wording, but keep every quoted letter or letter-group inside it in the original Latin script and inside its double quotes — the reader has to be able to see the exact letters that changed. Return "note" and "badge" only for items that already have them; never add either to an item that has none.\n\nOriginal Content:\n${JSON.stringify({ sections }, null, 2)}`,
      },
    ],
  });

  // Translation must not be allowed to swap in a different item's computed facts (badge/score/
  // highlight) — rebuild `known` maps straight from the ENGLISH sections being translated, keyed
  // by title, so mergeItems can only re-attach the same facts the item already had. `note` is the
  // one exception (prose, not a computed fact) and is taken from the translation — see mergeItems.
  const knownItems = new Map<string, ReportSectionItem>();
  for (const s of sections) {
    for (const item of s.items ?? []) {
      knownItems.set(item.title.trim().toLowerCase(), item);
    }
  }

  const parsed = parseSections(raw, knownItems, knownItems, true);
  if (!parsed) {
    throw new Error(
      `name change report translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
  return parsed;
}
