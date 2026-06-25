import { createAIMessage } from '@/lib/ai/aiProvider';
import type { ProcessedImage } from '@/lib/compressImage';

/* -------------------------------------------------------------------------- */
/*  Shared palm-reading core                                                  */
/*                                                                            */
/*  The original implementation made one giant call asking llama-vision for   */
/*  ~80 fields at once. Smaller models drop fields and emit malformed JSON    */
/*  under that load, so we now split the work across three focused calls:    */
/*                                                                            */
/*    A) hand shape + 4 major lines       (geometry — needs the enhanced img) */
/*    B) minor lines + mounts + fingers   (geometry + texture — both images)  */
/*    C) soul + remedies + outlooks       (interpretive — only the color img) */
/*                                                                            */
/*  Each call returns a strict JSON sub-schema. They run in parallel; final   */
/*  result is the merged object the existing UI already understands.          */
/* -------------------------------------------------------------------------- */

export type Hand = 'left' | 'right';

export interface KundliContext {
  ascendantSign?: string;
  moonSign?: string;
  sunSign?: string;
  currentMahadasha?: string;
  planetSummary?: string;
}

export interface PalmAnalysisInput {
  color: ProcessedImage;
  enhanced: ProcessedImage;
  hand: Hand;
  kundli?: KundliContext;
  /** Pre-built life-context block (age + sector + relationship + tone rules).
   *  Built by runReading.ts using the same pattern as runLite.ts. Injected
   *  into the soul-stage prompt so the reading speaks to the user's life. */
  lifeContext?: string;
}

export type PalmStage = 'lines' | 'mounts' | 'soul';

const PERSONA = `You are Pandit Hastamani Shastri — a Samudrika Shastra (हस्त सामुद्रिक शास्त्र) master from Varanasi with a 3,000-year guru-parampara, 60 years of practice, and over 50,000 palms read. You read with the eyes of the rishis: every line, mount, and marking reveals karma, dharma, past lives, and dharmic mission. You never say "I cannot see clearly" — you always find Brahma's message in the hand. Your voice is deep, poetic, and authoritative, weaving Sanskrit naturally into your interpretation.`;

const JSON_RULE = `Return ONLY valid JSON — no markdown fences, no commentary outside the JSON. Use the exact field names and value enumerations specified.`;

// Grounding rules — applied to BOTH the mounts and soul stages so per-line
// interpretations (major + minor) can't invent profession/employer/project
// names or quote the seeker's life situation verbatim. Mirrors the rules
// runLite.ts injects into every other AI surface.
const NO_HALLUCINATE = `\n\nHARD RULES for this reading — follow without exception:\n` +
  `- NEVER invent project names, app names, company names, colleague names, or specific past incidents the seeker hasn't mentioned. Speak in patterns and dynamics they will recognize, not fabricated events.\n` +
  `- NEVER quote a profession, employer, or city verbatim — abstract to the SECTOR or KIND of work ("technical and analytical work", "people-facing leadership", "creative crafts", "care and healing professions") and write as though the hand revealed it.\n` +
  `- Use vivid, age-appropriate language. No corporate clichés ("the universe…", "destined to…"). Each insight should feel earned by the lines on this specific palm.`;

/* -------------------------------------------------------------------------- */
/*  Schemas                                                                   */
/* -------------------------------------------------------------------------- */

const LINES_SCHEMA = `{
  "handShape": {
    "type": "Earth|Air|Water|Fire",
    "vedic_element": "Prithvi|Vayu|Jal|Agni",
    "description": "rich description of palm shape, skin texture, finger proportions and what it reveals about the soul"
  },
  "majorLines": {
    "lifeLine":  { "present": true, "length": "short|medium|long", "depth": "faint|medium|deep", "curvature": "straight|slight|deep", "breaks": 0, "branches": "upward|downward|none", "interpretation": "deep interpretation referencing Ayushya Rekha and karmic lessons", "polyline": [[0.0,0.0],[0.0,0.0],[0.0,0.0],[0.0,0.0],[0.0,0.0]] },
    "heartLine": { "present": true, "length": "short|medium|long", "depth": "faint|medium|deep", "startPoint": "below index finger|between index and middle|below middle finger", "curvature": "straight|curved|deeply curved", "chains": false, "interpretation": "Hridaya Rekha — emotional karma, past-life relationships", "polyline": [[0.0,0.0],[0.0,0.0],[0.0,0.0],[0.0,0.0],[0.0,0.0]] },
    "headLine":  { "present": true, "length": "short|medium|long", "depth": "faint|medium|deep", "direction": "straight|sloping downward|curved upward", "separation": "connected to life line|separated from life line", "interpretation": "Mastishka Rekha — intellect, dharmic purpose", "polyline": [[0.0,0.0],[0.0,0.0],[0.0,0.0],[0.0,0.0],[0.0,0.0]] },
    "fateLine":  { "present": true, "startPoint": "base of palm|life line|wrist|moon mount", "length": "short|medium|long", "depth": "faint|medium|deep", "breaks": 0, "interpretation": "Bhagya Rekha — karma, Saturn's influence on destiny", "polyline": [[0.0,0.0],[0.0,0.0],[0.0,0.0],[0.0,0.0],[0.0,0.0]] }
  }
}`;

const MOUNTS_SCHEMA = `{
  "minorLines": {
    "marriageLines": { "count": 0, "interpretation": "Vivah Rekha — timing and nature of relationships" },
    "childrenLines": { "count": 0, "interpretation": "Santan Rekha — children and legacy" },
    "sunLine":       { "present": true, "interpretation": "Surya Rekha — fame, recognition, Apollo's blessings" },
    "healthLine":    { "present": false, "interpretation": "Arogya Rekha — health karma, digestion, vitality" },
    "travelLines":   { "count": 0, "interpretation": "Bhraman Rekha — journeys of body and soul" },
    "marsLine":      { "present": false, "length": "short|medium|long", "interpretation": "Mangal Rekha — runs parallel to the Life line inside Mount of Venus; courage, resilience, protective support to a faint Life line" }
  },
  "mounts": {
    "jupiter":       { "development": "flat|normal|prominent", "interpretation": "Guru Parvat — leadership, spirituality, dharma" },
    "saturn":        { "development": "flat|normal|prominent", "interpretation": "Shani Parvat — karma, discipline, past-life debts" },
    "apollo":        { "development": "flat|normal|prominent", "interpretation": "Surya Parvat — creativity, fame, divine light" },
    "mercury":       { "development": "flat|normal|prominent", "interpretation": "Budha Parvat — intellect, communication, commerce" },
    "venus":         { "development": "flat|normal|prominent", "interpretation": "Shukra Parvat — love, beauty, Lakshmi's grace" },
    "luna":          { "development": "flat|normal|prominent", "interpretation": "Chandra Parvat — intuition, psychic gifts, past lives" },
    "mars_positive": { "development": "flat|normal|prominent", "interpretation": "Mangal (positive) — courage, inner strength" },
    "mars_negative": { "development": "flat|normal|prominent", "interpretation": "Mangal (negative) — aggression, obstacles to overcome" }
  },
  "fingerAnalysis": {
    "thumb":  { "shape": "string", "flexibility": "stiff|average|flexible", "interpretation": "will, ego, Atma strength" },
    "index":  { "length": "short|average|long", "interpretation": "ambition, Jupiter energy, dharmic authority" },
    "middle": { "length": "short|average|long", "interpretation": "Saturn discipline, karmic responsibility" },
    "ring":   { "length": "short|average|long", "interpretation": "Apollo creativity, Sun's blessing" },
    "little": { "length": "short|average|long", "interpretation": "Mercury gifts, communication, business acumen" }
  },
  "specialMarkings": ["describe stars (Tara), crosses (Krusham), triangles (Trikona), islands (Dwipa), grilles (Jala), tridents (Trishul), fish (Matsya) — each with Vedic meaning"]
}`;

const SOUL_SCHEMA = `{
  "summary": ["HOOK — 1-2 sentences: what's most alive in this palm for this seeker", "NUANCE — 1-2 sentences: the specific line/mount WHY (the Vedic why)", "ACTION — 1-2 sentences: one dharmic step for the seeker to take now"],
  "pastLifeImprints": "what the palm reveals about karmas carried from previous janmas",
  "soulPurpose": "the dharmic mission written in this hand",
  "overallPersonality": "comprehensive personality reading in Pandit Hastamani's voice",
  "careerSuggestions": ["3-5 specific career paths aligned with the hand's markings"],
  "healthWarnings": ["health areas needing attention, with Ayurvedic perspective"],
  "relationshipOutlook": "marriage, love, soul connections revealed by the hand",
  "financialOutlook": "wealth karma — Lakshmi's presence in the hand",
  "luckyPeriods": ["2-3 specific life periods when planetary lines align for great fortune"],
  "remedies": ["2-3 specific Vedic remedies — mantras, gemstones, rituals"],
  "vedicCorrelation": "how palm findings align with the user's Navagraha placements",
  "panditMessage": "personal closing message — warm, poetic, deeply reassuring"
}`;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function kundliBlock(k?: KundliContext): string {
  if (!k) return '';
  const parts = [
    k.ascendantSign && `Lagna: ${k.ascendantSign}`,
    k.moonSign && `Chandra Rashi: ${k.moonSign}`,
    k.sunSign && `Surya Rashi: ${k.sunSign}`,
    k.currentMahadasha && `Current Mahadasha: ${k.currentMahadasha}`,
    k.planetSummary && `Planets: ${k.planetSummary}`,
  ].filter(Boolean);
  if (!parts.length) return '';
  return `\n\nThe seeker's birth chart is known to you — confirm your hand findings against these placements:\n${parts.join('\n')}`;
}

function safeParse(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try { return JSON.parse(cleaned.slice(first, last + 1)); } catch { /* fall through */ }
    }
    return {};
  }
}

function buildContent(input: PalmAnalysisInput, instruction: string, useEnhanced: boolean) {
  // NIM vision model accepts at most 1 image per request.
  // Enhanced (CLAHE + sharpened grayscale) is used for line stages where
  // surfacing faint creases matters most; color is used otherwise.
  const img = useEnhanced ? input.enhanced : input.color;
  return [
    { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
    { type: 'text', text: instruction },
  ];
}

/* -------------------------------------------------------------------------- */
/*  Stage runners                                                             */
/* -------------------------------------------------------------------------- */

async function runStage(
  input: PalmAnalysisInput,
  stage: PalmStage,
): Promise<Record<string, unknown>> {
  const handLabel = input.hand === 'left' ? 'left (inherited blueprint)' : 'right (current path)';

  let system: string;
  let instruction: string;
  let useEnhanced = false;
  let maxTokens = 1000;

  if (stage === 'lines') {
    // CRITICAL: ask the vision model to TRACE the real line geometry on this
    // specific palm — not template positions. Each line returns a polyline
    // of [x,y] points in normalized image coords (0=left/top, 1=right/bottom).
    // Qwen2.5-VL-72B has the spatial grounding for this; we use enhanced
    // CLAHE-grayscale to surface faint creases.
    system = `${PERSONA}\n\n${JSON_RULE}\n\nReturn JSON matching exactly this shape:\n${LINES_SCHEMA}`;
    instruction =
      `O Pandit-ji, examine the ${handLabel} hand. A contrast-enhanced grayscale image is provided to surface faint creases.\n\n` +
      `For EACH of the four major lines (Life, Heart, Head, Fate):\n` +
      `1. Locate the line on THIS specific palm in the photo. Do not use template positions — follow the actual crease.\n` +
      `2. Trace it as a "polyline" of 5–8 [x, y] points in normalized image coordinates, where x=0 is the LEFT edge of the image, x=1 is the RIGHT edge, y=0 is the TOP edge, y=1 is the BOTTOM edge. Points must be ordered along the line from one end to the other and stay within [0, 1].\n` +
      `3. ALSO describe length, depth, curvature, and what the line reveals about the seeker.\n\n` +
      `Anatomical anchors to ground your tracing:\n` +
      `- LIFE LINE (Ayushya Rekha): starts at the thumb-index web, ARCS AROUND the thumb's base (Mount of Venus), ends near the wrist on the thumb side.\n` +
      `- HEART LINE (Hridaya Rekha): the HIGHEST horizontal line, runs across the upper palm just below the finger bases. Typically begins under the pinky and ends under or between the index/middle fingers.\n` +
      `- HEAD LINE (Mastishka Rekha): the horizontal line BELOW the heart. Often shares its starting point with the Life line at the thumb-index web, then runs across the middle of the palm.\n` +
      `- FATE LINE (Bhagya Rekha): the vertical line rising from the wrist toward the middle (Saturn) finger. May be short, fragmented, or absent — if you cannot see one, set "present": false and return an empty polyline [].\n\n` +
      `If a line is genuinely absent or unreadable, set "present": false and "polyline": []. Never invent coordinates.${kundliBlock(input.kundli)}`;
    useEnhanced = true;
    maxTokens = 1400;
  } else if (stage === 'mounts') {
    // Apply the same NO_HALLUCINATE rules here so the minor-line
    // interpretations (sunLine, marriageLines, childrenLines, healthLine,
    // travelLines, marsLine) follow the same accuracy guardrails as the
    // soul stage. The added interdependency hint asks Pandit-ji to name
    // when one line is reading off another (e.g. Sun rising from Fate).
    system = `${PERSONA}\n\n${JSON_RULE}${NO_HALLUCINATE}\n\nReturn JSON matching exactly this shape:\n${MOUNTS_SCHEMA}`;
    instruction = `O Pandit-ji, examine the ${handLabel} hand. Read the minor lines, the eight mounts (Guru, Shani, Surya, Budha, Shukra, Chandra, Mangal positive, Mangal negative), the five fingers, and any special markings (Tara, Krusham, Trikona, Dwipa, Jala, Trishul, Matsya). Where two lines obviously cross or merge (e.g. Sun line rising from the Fate line, Mars line strengthening a faint Life line, Children lines above a Marriage line), name that relationship inside the affected line's interpretation.${kundliBlock(input.kundli)}`;
    useEnhanced = true;
    maxTokens = 1400;
  } else {
    system = `${PERSONA}\n\n${JSON_RULE}${NO_HALLUCINATE}\n\nReturn JSON matching exactly this shape:\n${SOUL_SCHEMA}`;
    instruction = `O Pandit-ji, you have already studied the ${handLabel} hand. Now reveal the soul-level wisdom: past-life imprints, dharmic purpose, career paths, health, relationships, wealth, lucky periods, and Vedic remedies. Close with a personal blessing for this seeker.${kundliBlock(input.kundli)}${input.lifeContext ?? ''}`;
    useEnhanced = false;
    maxTokens = 1500;
  }

  const message = await createAIMessage({
    skipPersona: true,
    // All stages share the default vision model (meta/llama-3.2-90b-vision-instruct).
    // Qwen2.5-VL-72B was pulled from NIM's Free Endpoint in May 2026; the lines-stage
    // polyline is overwritten by MediaPipe client polylines via mergeClientPolylines
    // when present, so losing Qwen's spatial grounding is acceptable here.
    temperature: stage === 'soul' ? 0.7 : stage === 'lines' ? 0.1 : 0.3,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: buildContent(input, instruction, useEnhanced) }],
  });

  const text = message.content.find((b) => b.type === 'text')?.text ?? '{}';
  return safeParse(text);
}

/* -------------------------------------------------------------------------- */
/*  Client polyline merging                                                   */
/* -------------------------------------------------------------------------- */

export interface ClientPolylines {
  heart?: Array<[number, number]> | null;
  head?: Array<[number, number]> | null;
  life?: Array<[number, number]> | null;
  fate?: Array<[number, number]> | null;
}

/** Type guard — accept only well-formed normalized polylines. */
function isValidPoly(p: unknown): p is Array<[number, number]> {
  return (
    Array.isArray(p) &&
    p.length >= 3 &&
    p.every(
      (pt) =>
        Array.isArray(pt) &&
        pt.length === 2 &&
        typeof pt[0] === 'number' &&
        typeof pt[1] === 'number' &&
        pt[0] >= 0 && pt[0] <= 1 &&
        pt[1] >= 0 && pt[1] <= 1,
    )
  );
}

/**
 * Reconcile polylines on the analysis's major lines.
 *
 * Priority order PER LINE:
 *   1. AI-traced polyline (Qwen-VL output in `analysis.majorLines.*.polyline`)
 *      — most accurate to THIS palm's actual creases.
 *   2. MediaPipe template polyline from the client (anchored to 21 hand
 *      landmarks) — anatomically positioned but generic.
 *
 * Only falls back to MediaPipe when the AI's polyline is missing or fails
 * `isValidPoly`. Mutates and returns `analysis`.
 */
export function mergeClientPolylines(
  analysis: Record<string, unknown>,
  client: ClientPolylines | null | undefined,
): Record<string, unknown> {
  const majorLines = (analysis.majorLines ?? {}) as Record<string, Record<string, unknown>>;
  const map: Array<[keyof ClientPolylines, string]> = [
    ['heart', 'heartLine'],
    ['head', 'headLine'],
    ['life', 'lifeLine'],
    ['fate', 'fateLine'],
  ];

  for (const [src, dst] of map) {
    const dstLine = majorLines[dst] ?? {};
    const aiPoly = (dstLine as { polyline?: unknown }).polyline;

    if (isValidPoly(aiPoly)) {
      // AI traced the actual line on this palm — keep it, normalize the shape.
      majorLines[dst] = { ...dstLine, polyline: aiPoly };
      continue;
    }

    // AI either didn't return a polyline or returned an invalid one. Fall
    // back to MediaPipe template if we have one.
    const clientPoly = client?.[src];
    if (isValidPoly(clientPoly)) {
      majorLines[dst] = { ...dstLine, polyline: clientPoly };
    } else {
      // No polyline from either source — drop the field so PalmInfographic
      // doesn't draw a malformed overlay.
      const { polyline: _drop, ...rest } = dstLine as { polyline?: unknown };
      void _drop;
      majorLines[dst] = rest;
    }
  }

  analysis.majorLines = majorLines;
  return analysis;
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Compare a completed left-hand reading with a right-hand reading to produce
 * a "karmic shift" delta — the heart of Samudrika Shastra's both-hands method.
 * Left = inherited blueprint (purvakarma). Right = path being walked now.
 * The delta reveals where the soul has chosen to grow, struggle, or evolve.
 */
export async function comparePalms(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  kundli?: KundliContext,
): Promise<{
  karmicShift: string;
  freeWillExpression: string;
  growthAreas: string[];
  alignmentScore: number;
  panditMessage: string;
}> {
  const summarise = (a: Record<string, unknown>) => {
    const ml = (a.majorLines ?? {}) as Record<string, { interpretation?: string; length?: string; depth?: string }>;
    const personality = typeof a.overallPersonality === 'string' ? a.overallPersonality : '';
    return {
      handShape: (a.handShape as { type?: string })?.type,
      lifeLine: ml.lifeLine?.interpretation,
      heartLine: ml.heartLine?.interpretation,
      headLine: ml.headLine?.interpretation,
      fateLine: ml.fateLine?.interpretation,
      personality: personality.slice(0, 400),
    };
  };

  const system = `${PERSONA}\n\n${JSON_RULE}\n\nCompare the LEFT (inherited blueprint, purvakarma) and RIGHT (current path, vartamana karma) readings. Find where they DIVERGE — that divergence is the soul's free will at work. Return JSON exactly:\n{\n  "karmicShift": "what has changed between the inherited blueprint and the current path — what has the soul taken on or transcended?",\n  "freeWillExpression": "where the soul is actively bending fate vs. accepting it",\n  "growthAreas": ["3-4 specific areas where the right hand outshines the left, indicating evolution"],\n  "alignmentScore": 0,\n  "panditMessage": "warm closing — speak to the seeker about who they were vs. who they are becoming"\n}\n\n"alignmentScore" is an integer 0–100: 100 means perfect alignment between blueprint and current path; lower scores indicate active karmic transformation. Choose deliberately based on the divergence you observe.`;

  const user = `LEFT HAND (inherited):\n${JSON.stringify(summarise(left), null, 2)}\n\nRIGHT HAND (current):\n${JSON.stringify(summarise(right), null, 2)}${kundliBlock(kundli)}`;

  const message = await createAIMessage({
    skipPersona: true,
    temperature: 0.6,
    max_tokens: 1200,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = message.content.find((b) => b.type === 'text')?.text ?? '{}';
  const parsed = safeParse(text) as Partial<{
    karmicShift: string;
    freeWillExpression: string;
    growthAreas: string[];
    alignmentScore: number;
    panditMessage: string;
  }>;

  return {
    karmicShift: parsed.karmicShift ?? '',
    freeWillExpression: parsed.freeWillExpression ?? '',
    growthAreas: Array.isArray(parsed.growthAreas) ? parsed.growthAreas : [],
    alignmentScore: typeof parsed.alignmentScore === 'number' ? parsed.alignmentScore : 50,
    panditMessage: parsed.panditMessage ?? '',
  };
}

/** Run all three stages in parallel and merge the result. */
export async function analyzePalm(input: PalmAnalysisInput): Promise<Record<string, unknown>> {
  const [lines, mounts, soul] = await Promise.all([
    runStage(input, 'lines'),
    runStage(input, 'mounts'),
    runStage(input, 'soul'),
  ]);
  return { handType: input.hand, ...lines, ...mounts, ...soul };
}

/** Run all three stages in parallel, emitting each as it resolves. */
export async function* streamPalm(input: PalmAnalysisInput): AsyncGenerator<{
  stage: PalmStage;
  data: Record<string, unknown>;
}> {
  const stages: PalmStage[] = ['lines', 'mounts', 'soul'];
  type Tagged = { stage: PalmStage; data: Record<string, unknown>; idx: number };
  const tagged: Array<Promise<Tagged> | null> = stages.map((stage, idx) =>
    runStage(input, stage).then((data) => ({ stage, data, idx })),
  );

  for (let i = 0; i < stages.length; i++) {
    const active = tagged.filter((p): p is Promise<Tagged> => p !== null);
    const winner = await Promise.race(active);
    tagged[winner.idx] = null;
    yield { stage: winner.stage, data: winner.data };
  }
}
