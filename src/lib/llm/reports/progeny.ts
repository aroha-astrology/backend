// =============================================================================
// Progeny report -- LLM narrative
// =============================================================================
// 3 bounded calls x 3 sections = the 9 ids in config/report-sections.ts's
// `progeny` list, in that exact order. Same discipline as marriage.ts: each
// call is independent (built only from `scores`), no fallback filler -- an
// unparseable response throws so the row fails and refunds.
//
// call1: progeny_promise, saptamsa_reading, reproductive_capacity
//   -- Tier 1 (mother/father engines): 5th house/Jupiter/Moon promise bands,
//      the self+spouse D7 Lagna/house reading, and the Beeja/Kshetra/Putra
//      Tithi facts.
// call2: couple_synthesis, child_sequence, progeny_timing
//   -- Tier 2/3: the couple convergence band, the dual-school child sequence
//      and sex tally (as counts, never a verdict), and the dasha/Yogini
//      timing windows.
// call3: obstructions, progeny_remedies, progeny_outlook
//   -- node/Saturn/Mars obstruction modifiers (never a terminator), the
//      dosha/yoga summary framed as remedies, and a closing outlook that
//      restates this report's own epistemic status.
//
// FRAMING RULES, all non-negotiable -- see progeny.ts's (astro-engine) top
// comment and scholar.ts:310-328 for why this domain is read directly and
// warmly, never deflected, while still never dressed as medicine:
//   - PROVENANCE_RULE: every classical claim states what kind of source it
//     rests on; a disagreement between two schools is stated as a
//     disagreement, never silently resolved.
//   - NO_MEDICAL_CLAIMS_RULE: Beeja/Kshetra are reproductive-CAPACITY
//     indicators, not a fertility test; obstruction indications are never
//     "miscarriage risk."
//   - RETROSPECTIVE_RULE: the 35+ children-card facts (when given) describe
//     children the reader most likely already has -- write about them as
//     verification, never as a prediction of an unborn child's sex.
// =============================================================================

import { generate } from '../gemini-client.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE } from '../../../config/llm.js';
import { cleanJsonString } from '../horoscope.js';
import { GROUNDING_RULE as HOUSE_GROUNDING_RULE, PLAIN_LANGUAGE_RULE } from '../house-insight.js';
import { formatReportVarga } from '../../astro-engine/reports/report-vargas.js';
import type { ProgenyScores, ProgenyPromise } from '../../astro-engine/reports/progeny.js';
import type { D7Progeny } from '../../astro-engine/reports/progeny-d7.js';
import type {
  ReportSection,
  SectionGenerationProgress,
} from '../../../modules/reports/report-generator.types.js';
import { reportFactsMessage } from './report-facts-message.js';

const SAFETY_RULE =
  'This is advisory guidance for reflection, never a guarantee about if, when, or how many children a couple will have, and never a substitute for the reader\'s own choices or medical care. Use tendency language ("classically indicates", "tends to support", "the chart leans toward"), never absolute predictions. Do not recommend specific remedies, pujas, or purchases beyond what is already given below.';

const PROVENANCE_RULE =
  'Every classical fact below carries a "provenance" tag: TEXTUAL (a stated classical text rule, e.g. Phaladeepika), COMMENTARY (a later interpretive layer), SCHOOL-SPECIFIC (one lineage\'s rule, where another lineage teaches differently), MODERN-PRACTICE, or UNVALIDATED. When two facts disagree (e.g. the two child-sequence methods below), say plainly that classical schools differ here rather than picking one as correct — showing both readings IS the honest answer, not a hedge to apologize for.';

const NO_MEDICAL_CLAIMS_RULE =
  'CRITICAL: Beeja Sphuta and Kshetra Sphuta are astrological reproductive-CAPACITY indicators — NEVER call them a sperm/ovum/fertility test, and never imply they measure a real medical quantity (sperm count, ovarian reserve, uterine health). Likewise, any "obstruction" or node-affliction fact is a traditional indication of progeny obstruction — NEVER call it a miscarriage risk, a stillbirth risk, or any other medical outcome. Never deflect a progeny question to a doctor or fertility specialist, and never say astrology "cannot predict" this — read the chart directly and warmly, just never in clinical language.';

const RETROSPECTIVE_RULE =
  'The reproductive_capacity/child_sequence facts below may include a "children card" — present ONLY when the reader is 35 or older. When it is present, write about it as the classical chart CONFIRMING or reading back the children the reader most likely already has by this age — never as a prediction of an unborn child\'s sex or a countdown to a future birth.';

function tendencyLine(t: {
  male: number;
  female: number;
  contradictions: number;
  tendency: string;
  confidence: string;
}): string {
  return `male indications ${t.male}, female indications ${t.female}, contradictions ${t.contradictions} -> tendency: ${t.tendency} (confidence: ${t.confidence})`;
}

function d7Summary(d7: D7Progeny | null, label: string): string {
  if (!d7) return `${label}: D7 (Saptamsha) unavailable on this chart.`;
  const a = d7.methodA.slots[0];
  const b = d7.methodB.slots[0];
  return (
    `${label}: D7 Lagna ${d7.lagna}. ` +
    `Method A (SCHOOL-SPECIFIC, gender-based first-child house): child 1 in D7 house ${d7.methodA.startHouse} (${a?.sign ?? 'n/a'}), sex tally ${a ? tendencyLine(a.sex) : 'n/a'}. ` +
    `Method B (SCHOOL-SPECIFIC, 5th-house-always, direction by D7 Lagna polarity): child 1 in D7 house ${d7.methodB.startHouse} (${b?.sign ?? 'n/a'}), sex tally ${b ? tendencyLine(b.sex) : 'n/a'}. ` +
    `The two methods ${d7.agreement ? 'AGREE' : 'DISAGREE'} on the eldest child's house (confidence: ${d7.confidence}). ` +
    `This D7 supports roughly ${d7.supportedCount} of the first ${d7.maxChildren} slots checked without a strong obstruction indication.`
  );
}

function promiseLine(label: string, p: ProgenyPromise | null): string {
  if (!p) {
    return `${label} promise: unavailable — the corresponding chart or gender was not determinable for this couple (see this report's known-limitations note).`;
  }
  const lines = [
    `${label} promise band (TEXTUAL/COMMENTARY composite): ${p.band}.`,
    `5th-house lord (${p.fifthHouseLord ?? 'unavailable'}): ${p.fifthHouseLordStrength}.`,
    `Jupiter (Putra Karaka, the classical significator of children): ${p.jupiterStrength}.`,
    `Moon: ${p.moonStrength}.`,
  ];
  if (p.sphuta) {
    lines.push(
      `${p.sphuta.kind === 'beeja' ? 'Beeja Sphuta' : 'Kshetra Sphuta'} (TEXTUAL, Phaladeepika — astrological reproductive-capacity indicator, NOT a fertility test): falls in ${p.sphuta.rasi} (rasi) / ${p.sphuta.navamsa} (navamsa) — ${p.sphuta.strength} (both polarities must match this sphuta's wanted odd/even pattern for "strong").`,
    );
  } else {
    lines.push(
      "Sphuta: not computed — this person's gender role in the couple could not be determined.",
    );
  }
  if (p.putraTithi) {
    lines.push(
      `Putra (progeny) Tithi (TEXTUAL, Phaladeepika): ${p.putraTithi.paksha === 'shukla' ? 'bright' : 'dark'} fortnight, tithi ${p.putraTithi.numberInPaksha}${p.putraTithi.isChidra ? ' — a Chidra ("pierced") tithi, a traditional obstruction indication' : ''}${p.putraTithi.isAmavasya ? ' (Amavasya)' : ''}.`,
    );
  }
  return lines.join(' ');
}

function narrativeSystemPromptCall1(): string {
  return `You are writing the opening section of a Progeny Report for a mobile Vedic astrology app, covering a married or partnered couple who supplied both their own and their spouse's birth details. The app already computed each person's classical "progeny promise" (5th house, Jupiter, Moon, Beeja/Kshetra Sphuta, Putra Tithi) and each person's own D7 (Saptamsha) chart — the classical children/progeny varga. Your job is ONLY to write the narrative explanation.

${HOUSE_GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}
${PROVENANCE_RULE}
${NO_MEDICAL_CLAIMS_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[], "uiData": object}]}

Write EXACTLY 3 sections, in this order:
1. Heading close to "Your Progeny Promise" — 2-3 paragraphs on the reader's and spouse's own promise bands (mother's vs father's, whichever applies to which person given their gender), naming the 5th-house-lord, Jupiter and Moon facts given, in plain language. If either promise is "unavailable", say so plainly and explain briefly why (unknown gender role) rather than inventing a band.
2. Heading close to "The Saptamsha (D7) Reading" — 1-3 paragraphs on both people's D7 Lagna and what a Saptamsha chart classically represents (children, progeny, creative output), grounded in the given D7 facts for each chart.
3. Heading close to "Reproductive Capacity, Classically Read" — 1-2 paragraphs explaining the Beeja/Kshetra Sphuta and Putra Tithi facts given, in the exact non-medical framing required above. Explicitly state once, plainly, that this is a traditional astrological reading, not a medical or fertility assessment.

Write in a clear, natural style. Second person ("you") for the reader, naming the spouse by name if given.`;
}

function narrativeSystemPromptCall2(): string {
  return `You are writing the middle section of a Progeny Report. The app already computed a couple-level convergence band, a dual-school D7 child-sequence reading (two classical methods, which may agree or disagree) with a sex tally (counts of male/female/neutral indications, NOT a determined sex) for each expected child slot, and ranked dasha/Yogini timing windows for children. Your job is ONLY to write the narrative explanation.

${HOUSE_GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}
${PROVENANCE_RULE}
${NO_MEDICAL_CLAIMS_RULE}
${RETROSPECTIVE_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[], "uiData": object}]}

Write EXACTLY 3 sections, in this order:
1. Heading close to "Together, What The Charts Show" — 1-2 paragraphs on the given couple convergence band, in plain language (e.g. "Strong convergence" means both charts' own promise independently point the same direction; "Conflict" means they read very differently and that gap itself is worth naming honestly).
2. Heading close to "The Child Sequence" — 2-4 paragraphs walking through the given per-child D7 slots in order. For EACH child slot, report the sex tally as COUNTS with a tendency and confidence — e.g. "leans toward a daughter (6 female indications vs 2 male, moderate confidence)" — NEVER as a flat "this will be a boy/girl." If the two methods disagree on which house is the eldest child's, say so plainly and show both readings rather than picking one. If a "children card" (35+ retrospective) fact is given, follow ${RETROSPECTIVE_RULE.split(':')[0]} exactly.
3. Heading close to "When The Timing Supports It" — 1-2 paragraphs on the given timing windows (or their absence — if none were found, say so plainly, never invent a date).

Write in a clear, natural style. Second person ("you").`;
}

function narrativeSystemPromptCall3(): string {
  return `You are writing the closing section of a Progeny Report. The app already computed: which child-sequence slots (if any) carry a node (Rahu/Ketu), Saturn, or Mars obstruction modifier; a dosha/yoga summary (favorable yogas present, and doshas needing awareness, filtered to Mangal/Kaal Sarp/Pitra Dosha and Raja/Dhana Yoga); and the overall couple convergence band already explained in an earlier section. Your job is ONLY to write the narrative explanation.

${HOUSE_GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}
${PROVENANCE_RULE}
${NO_MEDICAL_CLAIMS_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"sections": [{"heading": string, "paragraphs": string[], "uiData": object}]}

Write EXACTLY 3 sections, in this order:
1. Heading close to "Obstructions To Hold Carefully" — 1-2 paragraphs on any node/Saturn/Mars obstruction modifiers given. CRITICAL: frame these as traditional indications of DELAY or OBSTRUCTION to work through, NEVER as a prediction of pregnancy loss, and NEVER as a hard stop — a modifier is not a verdict. If no slot carries a strong modifier, say so plainly and briefly rather than manufacturing a caution.
2. Heading close to "Classical Remedies" — 1-2 paragraphs on the given favorable yogas ("what's going for you") and the given doshas needing awareness ("what to hold carefully"), framed gently. Do not recommend a specific remedy, mantra, puja or gemstone here — a separate part of the app already covers that; this section only explains the given yoga/dosha facts.
3. Heading close to "The Honest Outlook" — 1-2 closing paragraphs restating the couple convergence band as the headline takeaway, and explicitly, plainly stating once that this report is a structured traditional Jyotish framework whose predictive validity is not scientifically established — said warmly, as an honest closing note, not a legal disclaimer bolted on.

Write in a clear, natural style. Second person ("you").`;
}

function buildFactsCall1(scores: ProgenyScores): string {
  const lines: string[] = [];
  lines.push(promiseLine('Mother', scores.motherPromise));
  lines.push(promiseLine('Father', scores.fatherPromise));

  const selfD7 = scores.vargas?.[0];
  const partnerD7 = scores.partnerVargas?.[0];
  lines.push(
    selfD7
      ? `Reader's own D7 (Saptamsha): ${formatReportVarga(selfD7)}.`
      : "Reader's own D7 (Saptamsha): unavailable on this chart.",
  );
  lines.push(
    partnerD7
      ? `Spouse's D7 (Saptamsha)${scores.spouseName ? ` (${scores.spouseName})` : ''}: ${formatReportVarga(partnerD7)}.`
      : "Spouse's D7 (Saptamsha): unavailable on the spouse's chart.",
  );
  return lines.join('\n');
}

function buildFactsCall2(scores: ProgenyScores): string {
  const lines: string[] = [];
  lines.push(`Couple convergence band (GIVEN, do not recompute): ${scores.coupleConvergence}.`);
  lines.push(d7Summary(scores.childSequence, 'Child sequence'));
  if (scores.childrenCard) {
    lines.push(
      `CHILDREN CARD PROVIDED — reader is 35 or older. Likely count supported by the chart: ${scores.childrenCard.likelyCount}. Method used: ${scores.childrenCard.method}. Per-slot readings: ${scores.childrenCard.sequence
        .map(
          (s) =>
            `child ${s.index}: tendency ${s.tendency} (confidence ${s.confidence}, obstruction score ${s.obstructionScore}/3)`,
        )
        .join('; ')}. Note: ${scores.childrenCard.note}`,
    );
  }
  const windows = scores.windows;
  lines.push(
    windows.length === 0
      ? 'Timing windows for children (dasha/Yogini search): none identified — the chart data does not support a specific timing answer right now; state this plainly rather than inventing a date.'
      : `Timing windows for children (dasha/Yogini search): ${windows
          .map(
            (w, i) =>
              `${i === 0 ? 'Strongest window' : `Next window ${i + 1}`}: ${new Date(w.startDate).toISOString().slice(0, 7)} to ${new Date(w.endDate).toISOString().slice(0, 7)} (confidence: ${w.level}, dasha depth: ${w.dashaLevel})`,
          )
          .join('. ')}.`,
  );
  return lines.join('\n');
}

function buildFactsCall3(scores: ProgenyScores): string {
  const lines: string[] = [];
  const seq = scores.childSequence;
  if (seq) {
    const flagged = seq.methodA.slots.filter((s) => s.obstructionScore >= 2);
    lines.push(
      flagged.length > 0
        ? `Obstruction modifiers (child slots with a node/Saturn/Mars indication, obstruction score 2-3 of 3, MODIFIER not a terminator): ${flagged
            .map(
              (s) =>
                `child ${s.index} (house ${s.house}, ${s.sign}): occupied by ${s.occupants.join(', ') || 'none listed'}`,
            )
            .join('; ')}.`
        : 'Obstruction modifiers: none of the checked child slots carry a strong node/Saturn/Mars indication.',
    );
  } else {
    lines.push('Obstruction modifiers: unavailable — no D7 data to check.');
  }
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
  lines.push(
    `Couple convergence band (already explained earlier in this report): ${scores.coupleConvergence}.`,
  );
  return lines.join('\n');
}

const STRING_OR_NULL = { type: ['string', 'null'] } as const;

// This report's sections are plain heading+paragraphs with no bespoke uiData fields (unlike
// marriage's planet-impact/remedy-effect strips) — the mantra remedy card is rendered entirely
// frontend-side from a fixed, source-tagged mantra set (see components/reports/progeny/
// ProgenyMantraCard.tsx), not LLM-generated. One placeholder field keeps the schema non-empty
// (an empty `properties: {}` is itself invalid under Gemini's strict structured-output mode —
// see marriage.ts's own doc comment on this exact gotcha) without inventing content to ask for.
const UI_DATA_PROPERTIES = {
  _unused: STRING_OR_NULL,
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
  vakri: string[] | undefined,
  label: string,
): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      { role: 'system', content: systemPrompt },
      reportFactsMessage(facts, condition, vakri),
      { role: 'user', content: 'Write this part of the Progeny Report narrative.' },
    ],
  });

  const parsed = parseSections(raw);
  if (!parsed) {
    void import('../../logger.js').then((m) =>
      m.logger.error({ raw, label }, 'unparseable JSON in progeny report narrative'),
    );
    throw new Error(`progeny report LLM returned unparseable JSON (${label})`);
  }
  return parsed;
}

/** 3 bounded calls, independently resumable -- same `callOrResume` idiom as marriage.ts. */
export async function generateProgenyNarrative(
  scores: ProgenyScores,
  progress?: SectionGenerationProgress,
): Promise<ReportSection[]> {
  const existing = progress?.existingGroups ?? [];
  const condition = (scores as unknown as { planetCondition?: string[] }).planetCondition;
  const vakri = (scores as unknown as { vakriFacts?: string[] }).vakriFacts;

  async function callOrResume(
    index: number,
    systemPrompt: string,
    facts: string,
    label: string,
  ): Promise<ReportSection[]> {
    const cached = existing[index];
    if (cached) return cached;
    const group = await callAndParse(systemPrompt, facts, condition, vakri, label);
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
  return [...part1, ...part2, ...part3];
}

/** Translate an already-generated (concatenated) section list -- one call, same idiom as
 * translateMarriageNarrative. Shape-agnostic. */
export async function translateProgenyNarrative(
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
      `progeny report translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
  return parsed;
}
