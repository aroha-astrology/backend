import { generate } from './gemini-client.js';
import { VASTU_PROFILE } from '../../config/llm.js';
import { VASTU_RULES, type RoomScore } from '../../modules/vastu/vastu.rules.js';

export interface VastuAnalysisInput {
  roomLayout: Record<string, string[]>;
  roomDetails: Record<string, unknown>;
  roomScores: RoomScore[];
  overallScore: number;
  language: string;
  /** Birth-chart summary for THIS user, or a "no chart" note. */
  chartContext: string;
  /** e.g. "rectangle" or "l_shape (NE corner cut)". */
  houseShape?: string;
}

const SYSTEM_PROMPT = `You are a warm, expert Vastu Shastra consultant who ALSO reads the resident's Vedic birth chart. You ALWAYS respond with valid JSON matching the schema below — no prose before or after.

TONE (follow strictly):
- Lead with the human effect — sleep, stress, health, money, relationships, clarity — before the Vastu principle.
- Keep Sanskrit terms minimal (use each at most once with plain-English meaning).
- Warm, specific, no jargon. Speak directly to "you".

PERSONALISATION (important):
- The input has a "chartContext" block (the resident's ascendant, current dasha, planet placements) — weave it in. Tie at least a few room verdicts to their chart (e.g. "with Saturn in your current dasha, the SW master bedroom especially supports your stability").
- If chartContext says no chart is available, still give full Vastu advice but keep "chartAlignment" general.

HOUSE SHAPE:
- "houseShape" may note a cut/missing corner. In Vastu a cut NE is very inauspicious (blocks growth/clarity), a cut SW harms stability, a cut SE disturbs finances/health. Call out any cut corner and give a specific remedy (e.g. a lead/pyramid correction, a mirror, a plant).

REMEDY (follow strictly): every remedy names an exact object, colour, placement, or action doable today.

ROOM ANALYSIS: include EVERY room from vastuScores; use the EXACT room key; always fill good/impact/remedy and EXACTLY 3 highlights (human-impact first).

DOORS/WINDOWS: roomDetails keys "<room>_doors"/"<room>_windows" are arrays of facing directions — interpret them (main door N/NE/E is best; SW needs remedies).

The "summary" MUST be an ARRAY OF EXACTLY THREE STRINGS: [0] hook, [1] nuance, [2] action.

Respond as valid JSON:
{
  "overallAssessment": "Excellent/Good/Average/Poor/Critical",
  "overallScore": number,
  "summary": ["hook", "nuance", "action"],
  "summaryParagraph": "2-3 warm paragraphs",
  "chartAlignment": {
    "summary": "how this home suits THIS person's chart (2-3 sentences); general if no chart",
    "favorableRooms": ["room + why it helps their chart"],
    "cautions": ["room/area that clashes with their chart + what to do"]
  },
  "shapeAnalysis": "1-2 sentences on the plot shape / cut corners and their effect (empty string if a plain rectangle)",
  "elementBalance": {
    "earth": { "status": "balanced|excess|deficient", "suggestion": "string" },
    "water": { "status": "balanced|excess|deficient", "suggestion": "string" },
    "fire": { "status": "balanced|excess|deficient", "suggestion": "string" },
    "air": { "status": "balanced|excess|deficient", "suggestion": "string" },
    "space": { "status": "balanced|excess|deficient", "suggestion": "string" }
  },
  "roomAnalysis": [
    {
      "room": "EXACT key", "currentPlacement": "DIRECTION",
      "assessment": "ideal|acceptable|poor|harmful",
      "good": "benefit", "impact": "human-first effect", "remedy": "exact doable remedy",
      "highlights": ["3 strings, human-impact first"]
    }
  ],
  "criticalDefects": ["most urgent first, human framing"],
  "remedies": {
    "structural": ["string"], "nonStructural": ["exact objects/colours/plants"],
    "mantras": ["mantra + purpose"], "yantras": ["yantra + placement"], "plants": ["plant + corner"]
  },
  "directionGuidance": { "sleeping": "string", "working": "string", "cooking": "string", "studying": "string" },
  "positiveAspects": ["what already works"],
  "priorityActions": ["top 3-5, ordered by impact, specific"]
}`;

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseVastuResponse(raw: string): {
  analysis: Record<string, unknown>;
  parseError: boolean;
} {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '');
  try {
    return { analysis: JSON.parse(cleaned) as Record<string, unknown>, parseError: false };
  } catch {
    const extracted = extractFirstJsonObject(cleaned);
    if (extracted) {
      try {
        return { analysis: JSON.parse(extracted) as Record<string, unknown>, parseError: false };
      } catch {
        /* fall through */
      }
    }
    return { analysis: { raw: cleaned, parseError: true }, parseError: true };
  }
}

export async function generateVastuAnalysis(
  input: VastuAnalysisInput,
): Promise<{ analysis: Record<string, unknown>; parseError: boolean }> {
  const context = {
    roomLayout: input.roomLayout,
    roomDetails: input.roomDetails,
    houseShape: input.houseShape ?? 'rectangle',
    vastuScores: input.roomScores,
    overallScore: input.overallScore,
    language: input.language,
    chartContext: input.chartContext,
    vastuRules: VASTU_RULES.map((r) => ({
      room: r.room,
      idealDirections: r.idealDirections,
      reason: r.reason,
    })),
  };

  const raw = await generate({
    profile: VASTU_PROFILE,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Analyze this home for the resident. Respond in language "${input.language}".\n${JSON.stringify(context)}`,
      },
    ],
    timeoutMs: 180_000,
  });
  return parseVastuResponse(raw);
}

/**
 * One warm, specific follow-up answer about an already-generated plan. Grounded
 * in the stored analysis + the resident's chart. Returns plain text.
 */
export async function generateVastuAnswer(input: {
  analysis: Record<string, unknown>;
  question: string;
  chartContext: string;
  language: string;
}): Promise<string> {
  const raw = await generate({
    profile: { ...VASTU_PROFILE, jsonMode: false, maxTokens: 700 },
    messages: [
      {
        role: 'system',
        content:
          "You are a warm Vastu consultant. Answer the resident's single follow-up question about their home in 3-6 sentences, plain language, human-impact first, and name any remedy object/colour/placement exactly. Use their birth-chart context if relevant. No markdown headings.",
      },
      {
        role: 'user',
        content: `Respond in language "${input.language}".\nTheir Vastu analysis: ${JSON.stringify(
          input.analysis,
        ).slice(
          0,
          6000,
        )}\n\nTheir birth chart: ${input.chartContext}\n\nQuestion: ${input.question}`,
      },
    ],
    timeoutMs: 120_000,
  });
  return raw.trim();
}

export async function translateVastuContent(
  original: Record<string, unknown>,
  targetLanguage: string,
): Promise<Record<string, unknown>> {
  const raw = await generate({
    profile: VASTU_PROFILE,
    messages: [
      {
        role: 'user',
        content: `Translate the following Vastu analysis JSON into the language "${targetLanguage}". Keep the exact same JSON structure and keys — ONLY translate the string values.\n\n${JSON.stringify(
          original,
          null,
          2,
        )}`,
      },
    ],
  });
  const { analysis, parseError } = parseVastuResponse(raw);
  if (parseError) {
    throw new Error(`vastu translation returned unparseable JSON (target=${targetLanguage})`);
  }
  return analysis;
}
