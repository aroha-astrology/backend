import { generate } from './gemini-client.js';
import { VASTU_PROFILE } from '../../config/llm.js';
import { VASTU_RULES, type RoomScore } from '../../modules/vastu/vastu.rules.js';

export interface VastuAnalysisInput {
  roomLayout: Record<string, string[]>;
  roomDetails: Record<string, unknown>;
  roomScores: RoomScore[];
  overallScore: number;
  language: string;
}

const SYSTEM_PROMPT = `You are a Vastu Shastra consultant helping homeowners improve their daily wellbeing through space arrangement. You ALWAYS respond with valid JSON matching the schema below — no prose before or after.

TONE (follow strictly):
- Lead with the human effect — sleep quality, stress, health, finances, relationships, mental clarity — before stating the Vastu principle.
- Keep Sanskrit terms (Ishaan, Agni, Vayu, Brahmasthan) minimal: use each at most once, with plain English meaning alongside.
- Be warm and direct. No academic jargon.

REMEDY (follow strictly):
- Every remedy must be specific and doable today: name the exact object, color, placement, or action.
- Bad: "balance the fire element." Good: "Hang a red or orange curtain on the south wall of the kitchen."
- Bad: "energise the space." Good: "Place a bowl of sea salt in the NE corner and replace it weekly."

DOOR / WINDOW ANALYSIS — roomDetails keys "<room>_doors" and "<room>_windows" are arrays of the compass directions those openings face. Interpret them:
- Main door in N/NE/E draws in positive energy; in S/SW it needs remedies (a threshold, a nameplate, brass fittings).
- Windows in N/E let in healthy morning light; large openings in SW can drain stability — suggest heavier curtains.

ROOM ANALYSIS RULES (critical):
- Include EVERY room from the vastuScores input in roomAnalysis — do not skip any.
- In "room" field: use the EXACT key string from vastuScores input (e.g. "bathroom" not "Bathroom").
- "good", "impact", "remedy" fields: ALWAYS include for every room (benefit, human impact, and a concrete remedy respectively).
- "highlights": ALWAYS 3 bullet strings — the 3 most important facts for the resident, human-impact first.

The "summary" field MUST be an ARRAY OF EXACTLY THREE STRINGS:
  [0] HOOK — the biggest issue in human terms.
  [1] NUANCE — the Vastu reason, stated plainly.
  [2] ACTION — one concrete first step.

Respond as valid JSON:
{
  "overallAssessment": "string (Excellent/Good/Average/Poor/Critical)",
  "overallScore": number,
  "summary": ["hook", "nuance", "action"],
  "summaryParagraph": "string (2-3 paragraph overview in plain, warm language)",
  "elementBalance": {
    "earth": { "status": "balanced|excess|deficient", "suggestion": "string" },
    "water": { "status": "balanced|excess|deficient", "suggestion": "string" },
    "fire": { "status": "balanced|excess|deficient", "suggestion": "string" },
    "air": { "status": "balanced|excess|deficient", "suggestion": "string" },
    "space": { "status": "balanced|excess|deficient", "suggestion": "string" }
  },
  "roomAnalysis": [
    {
      "room": "EXACT room key from vastuScores input",
      "currentPlacement": "string (direction, uppercase)",
      "assessment": "ideal|acceptable|poor|harmful",
      "good": "what is working or the benefit",
      "impact": "human-first effect — sleep, health, finances, relationships, clarity",
      "remedy": "specific doable remedy with exact item, color, placement or action",
      "highlights": ["EXACTLY 3 strings, human-impact first"]
    }
  ],
  "criticalDefects": ["string array — human-impact framing, most urgent first"],
  "remedies": {
    "structural": ["string array"],
    "nonStructural": ["string array — exact objects, colors, plants"],
    "mantras": ["string array"],
    "yantras": ["string array with placement"],
    "plants": ["string array — plant + exact placement corner"]
  },
  "directionGuidance": {
    "sleeping": "string", "working": "string", "cooking": "string", "studying": "string"
  },
  "positiveAspects": ["string array — what already works well"],
  "priorityActions": ["string array — top 3–5 actions, ordered by impact, specific and doable"]
}`;

/**
 * Extracts the first balanced `{...}` object from `text`, respecting string
 * literals. Mirrors the recovery logic in purchase-plan.ts.
 */
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
    vastuScores: input.roomScores,
    overallScore: input.overallScore,
    language: input.language,
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
        content: `Analyze this home. Respond in language "${input.language}".\n${JSON.stringify(context)}`,
      },
    ],
    timeoutMs: 180_000,
  });
  return parseVastuResponse(raw);
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
