// =============================================================================
// Palm reading (vision) — the AI analyzes an uploaded photo directly (see
// ChatMessage's `content: string | ContentPart[]` in config/llm.ts). Unlike
// every other report, there is no separate "deterministic facts" layer here
// — the photo itself IS the input, and the model's job is both to read it
// and narrate it. No fallback filler: an unparseable response throws. The
// photo's lifecycle (storage, deletion) is owned entirely by the CALLER
// (prime-reports.registry.ts's `palm` entry + modules/palm/palm-photo.repo.ts)
// — this module never persists the image itself.
// =============================================================================

import { generate } from './gemini-client.js';
import { PALM_REPORT_PROFILE, MODEL } from '../../config/llm.js';
import { cleanJsonString } from './horoscope.js';

export interface PalmLlmContext {
  imageBase64: string;
  mimeType: string;
}

export interface PalmNarrative {
  intro: string;
  lifeLine: string;
  heartLine: string;
  headLine: string;
  fateLine: string;
  overallGuidance: string;
}

export interface PalmReportResult extends PalmNarrative {
  model: string;
}

const GROUNDING_RULE =
  'Base your reading only on what is actually visible in the photo. If the palm or a specific line is not clearly visible, say so honestly rather than inventing detail.';
const PLAIN_LANGUAGE_RULE =
  'Write for someone with zero palmistry background. Explain what each line traditionally suggests in plain, real-life terms.';
const SAFETY_RULE =
  'This is a traditional palmistry reading for reflection and entertainment, never a medical diagnosis or a guaranteed prediction. Never comment on visible skin conditions, injuries, or anything resembling a medical concern — if something looks medically relevant, do not mention it at all; simply read the lines.';

function systemPrompt(): string {
  return `You are a traditional palmistry reader analyzing a photo of a person's palm for a mobile app screen.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"intro": string, "lifeLine": string, "heartLine": string, "headLine": string, "fateLine": string, "overallGuidance": string}

"intro": 2-3 sentences (under 55 words) — a warm overview of the palm's general character.
"lifeLine", "heartLine", "headLine", "fateLine": each 2-3 sentences (under 60 words) — what that specific line's shape/length/depth traditionally suggests. If a line is not clearly visible in the photo, say so plainly instead of inventing a reading for it.
"overallGuidance": 1-2 sentences (under 40 words) — practical, reflective guidance tying the reading together.
Second person, present tense, conversational.`;
}

const NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string' },
    lifeLine: { type: 'string' },
    heartLine: { type: 'string' },
    headLine: { type: 'string' },
    fateLine: { type: 'string' },
    overallGuidance: { type: 'string' },
  },
  required: ['intro', 'lifeLine', 'heartLine', 'headLine', 'fateLine', 'overallGuidance'],
} as const;

const NARRATIVE_FIELDS = [
  'intro',
  'lifeLine',
  'heartLine',
  'headLine',
  'fateLine',
  'overallGuidance',
] as const;

function parseNarrative(raw: string): PalmNarrative | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as Record<string, unknown>;
    const out: Partial<PalmNarrative> = {};
    for (const field of NARRATIVE_FIELDS) {
      const value = data[field];
      if (typeof value !== 'string' || !value.trim()) return null;
      out[field] = value.trim();
    }
    return out as PalmNarrative;
  } catch {
    return null;
  }
}

/**
 * No fallback: a failed or unparseable response throws rather than caching
 * generic filler — same discipline as every other report.
 */
export async function generatePalmReport(ctx: PalmLlmContext): Promise<PalmReportResult> {
  const raw = await generate({
    profile: PALM_REPORT_PROFILE,
    responseSchema: NARRATIVE_SCHEMA,
    messages: [
      { role: 'system', content: systemPrompt() },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this palm photo and write the reading.' },
          {
            type: 'image_url',
            image_url: { url: `data:${ctx.mimeType};base64,${ctx.imageBase64}` },
          },
        ],
      },
    ],
  });

  const parsed = parseNarrative(raw);
  if (!parsed) {
    void import('../logger.js').then((m) =>
      m.logger.error({ raw }, 'unparseable JSON in palm report'),
    );
    throw new Error('palm LLM returned unparseable JSON');
  }
  return { ...parsed, model: MODEL };
}

/** Translate an already-generated report's AI fields — same pattern as translateLifeAreaContent. */
export async function translatePalmContent(
  original: PalmNarrative,
  targetLanguage: string,
): Promise<PalmNarrative> {
  const raw = await generate({
    profile: PALM_REPORT_PROFILE,
    responseSchema: NARRATIVE_SCHEMA,
    messages: [
      {
        role: 'user',
        content: `Translate the following report content into the language "${targetLanguage}". Keep the exact same JSON structure and keys. ONLY translate the human-readable values.\n\nOriginal Content:\n${JSON.stringify(original, null, 2)}`,
      },
    ],
  });

  const parsed = parseNarrative(raw);
  if (!parsed) {
    throw new Error(`palm translation returned unparseable JSON (target=${targetLanguage})`);
  }
  return parsed;
}
