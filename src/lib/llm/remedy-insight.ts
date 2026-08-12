// =============================================================================
// Remedies page — the plain-language explanation layer
// =============================================================================
// One LLM call per birth profile, cached forever in remedy_insights. Turns the
// deterministic Lal Kitab facts into everyday language: what each placement
// means for the reader and why its remedy is the one prescribed.
//
// This is the SECOND half of each card. The first half — the remedy actions
// and the technical astrology (both house numbers, Pakka Ghar, displacement,
// blindness) — is deterministic and rendered without ever asking a model. So
// this module explains given facts and nothing else; it must never introduce a
// remedy, a placement, or a claim the engine did not produce.
//
// Distinct from lib/llm/reports/remedies.ts, which narrates the paid ₹99
// report as flowing prose sections. This one returns short, per-item strings
// keyed by planet and debt so they can sit inside the existing cards.
// =============================================================================

import { generate } from './gemini-client.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE, MODEL } from '../../config/llm.js';
import { cleanJsonString } from './horoscope.js';
import { PLAIN_LANGUAGE_RULE } from './house-insight.js';

export interface RemedyInsightFacts {
  planets: {
    planet: string;
    natalHouse: number;
    remedies: string[];
    isInPakkaGhar?: boolean;
    displacement?: string;
    blindness?: 'blind' | 'half-blind';
  }[];
  debts: { type: string; indicators: string[] }[];
}

export interface RemedyInsightNarrative {
  /** Two or three sentences framing the whole page. */
  intro: string;
  /** Plain-language explanation per planet, keyed by planet name. */
  planets: Record<string, string>;
  /** Plain-language explanation per debt, keyed by debt type. */
  debts: Record<string, string>;
}

const GROUNDING_RULE =
  "Every placement, Pakka Ghar flag, blindness flag, karmic debt and remedy below is a GIVEN FACT, already computed by a deterministic Lal Kitab analysis of the reader's natal chart. Never recompute, second-guess, contradict, or invent a new placement, debt or remedy. Your only job is to say, in everyday language, what each given fact means for the reader and why its given remedy fits it.";

const SAFETY_RULE =
  'This is traditional Lal Kitab guidance for reflection and everyday practice, never a guarantee about real-world outcomes and never a substitute for the reader\'s own judgement or professional (medical, legal, financial) advice. Use tendency language ("classically associated with", "traditionally considered", "often described as"), never absolute predictions. Never predict death, disease, divorce or financial ruin. Do NOT recommend gemstones, expensive purchases, or elaborate rituals — Lal Kitab remedies are deliberately simple, low-cost, everyday actions, and the ones given are the only ones on offer.';

const STYLE_RULE =
  'Write to the reader as "you". Each explanation is 2-3 sentences, warm and matter-of-fact, no jargon and no Sanskrit or Urdu terms the surrounding UI has not already shown. Do not restate the remedy instructions verbatim — the card already lists them directly above your text. Explain the WHY.';

function systemPrompt(): string {
  return `You are writing the plain-language layer of a Lal Kitab remedies page in a mobile Vedic astrology app. The app has already computed the reader's planetary placements, karmic debts and remedies, and already displays the technical astrology next to your text.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${STYLE_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"intro": string, "planets": {"<PlanetName>": string}, "debts": {"<DebtType>": string}}

Rules for the keys:
- "planets" MUST contain exactly one entry for each planet given below, keyed by the planet's exact English name as given (e.g. "Mars").
- "debts" MUST contain exactly one entry for each karmic debt given below, keyed by its exact type string as given (e.g. "Pitra Rin"). If no debts are given, return an empty object for "debts".
- "intro" is 2-3 sentences introducing the reader's overall picture, mentioning that these remedies are small daily habits rather than one-off events.`;
}

function buildFacts(facts: RemedyInsightFacts): string {
  const lines: string[] = ['PLANETS:'];
  for (const p of facts.planets) {
    const notes: string[] = [`natal house ${p.natalHouse}`];
    if (p.isInPakkaGhar)
      notes.push('sits in its own permanent house (Pakka Ghar), so it is strong');
    if (p.blindness) notes.push(`${p.blindness} (obstructed, results partly locked)`);
    if (p.displacement) notes.push(p.displacement);
    lines.push(`- ${p.planet}: ${notes.join('; ')}. Given remedies: ${p.remedies.join('; ')}.`);
  }

  if (facts.debts.length > 0) {
    lines.push('KARMIC DEBTS (Rin) present:');
    for (const d of facts.debts) {
      lines.push(`- ${d.type}: flagged by [${d.indicators.join('; ')}].`);
    }
  } else {
    lines.push('KARMIC DEBTS (Rin) present: NONE.');
  }

  return lines.join('\n');
}

const NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string' },
    planets: { type: 'object' },
    debts: { type: 'object' },
  },
  required: ['intro', 'planets'],
} as const;

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

function parseNarrative(raw: string): RemedyInsightNarrative | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as Record<string, unknown>;
    const intro = typeof data.intro === 'string' ? data.intro.trim() : '';
    const planets = asStringMap(data.planets);
    // An empty `planets` map means the model returned nothing usable for the
    // only part of this page that needs it — treat that as a failed parse
    // rather than caching a row that renders as blank explanations forever.
    if (!intro || Object.keys(planets).length === 0) return null;
    return { intro, planets, debts: asStringMap(data.debts) };
  } catch {
    return null;
  }
}

export async function generateRemedyInsight(
  facts: RemedyInsightFacts,
): Promise<{ narrative: RemedyInsightNarrative; model: string }> {
  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: NARRATIVE_SCHEMA,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: buildFacts(facts) },
      { role: 'user', content: 'Write the plain-language explanations.' },
    ],
  });

  const narrative = parseNarrative(raw);
  if (!narrative) {
    const { logger } = await import('../logger.js');
    logger.error({ raw: raw.slice(0, 2000) }, 'unparseable JSON in remedy insight');
    throw new Error('remedy insight LLM returned unparseable JSON');
  }
  return { narrative, model: MODEL };
}

export async function translateRemedyInsight(
  narrative: RemedyInsightNarrative,
  targetLanguage: string,
): Promise<RemedyInsightNarrative> {
  const raw = await generate({
    profile: REPORT_TRANSLATION_PROFILE,
    responseSchema: NARRATIVE_SCHEMA,
    messages: [
      {
        role: 'user',
        content: `Translate the VALUES of the following JSON into the language "${targetLanguage}". Keep the exact same JSON structure and the exact same KEYS — the keys are planet names and karmic debt names used as lookup identifiers and MUST stay in English, untranslated. Translate only the prose values.\n\n${JSON.stringify(narrative, null, 2)}`,
      },
    ],
  });

  const parsed = parseNarrative(raw);
  if (!parsed) {
    throw new Error(
      `remedy insight translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
  return parsed;
}
