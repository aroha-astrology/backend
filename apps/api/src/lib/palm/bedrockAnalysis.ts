import { invokeModel, invokeModelStream } from './bedrockClient';
import type { PalmAnalysisInput } from './analysis';

// Re-export types and utilities from analysis.ts so callers can swap imports
// without touching anything else.
export type { Hand, KundliContext, ClientPolylines, PalmAnalysisInput, PalmStage } from './analysis';
export { mergeClientPolylines } from './analysis';

/* -------------------------------------------------------------------------- */
/*  Model IDs                                                                 */
/* -------------------------------------------------------------------------- */

const VISION_MODEL = 'us.anthropic.claude-sonnet-4-6';
const BEDROCK_VERSION = 'bedrock-2023-05-31';

export type ReportDepth = 'basic' | 'full' | 'ultra';

const DEPTH_TOKENS: Record<ReportDepth, number> = {
  basic: 3000,
  full:  6000,
  ultra: 10000,
};

const DEPTH_INSTRUCTION: Record<ReportDepth, string> = {
  basic: 'Write a focused reading of 1500–2500 words total across all interpretation fields. Cover the essentials clearly.',
  full:  'Write a detailed reading of 2500–4000 words total across all interpretation fields. Include timing predictions and symbolic analysis.',
  ultra: 'Write an exhaustive reading of 5000+ words total across all interpretation fields. Cover every line, mount, symbol, and age period with maximum depth, timing precision, and spiritual context.',
};

/* -------------------------------------------------------------------------- */
/*  System prompt                                                             */
/* -------------------------------------------------------------------------- */

const SYSTEM_PROMPT = `You are an expert Hindu Palmistry and Hasta Samudrika Shastra reader with 60+ years of experience under Pandit Hastamani Shastri lineage — a 3,000-year Brahmin parampara from Varanasi with 50,000+ palms read.

## CORE RULES
- RIGHT HAND image → analyze as MALE (Karma Hast — active karma, current destiny)
- LEFT HAND image → analyze as FEMALE (Janma Hast — inherited soul blueprint, Sanchita karma)
- ALWAYS rate image quality FIRST. Score 0-10 for: overall clarity, line visibility, lighting, focus, framing. Be honest — if photo is poor, say so. Then still give your best reading from what you can see.
- NEVER give generic answers — every observation must be tied to a specific visible feature
- Base all predictions strictly on visible palm lines, mounts, finger shape, symbols, texture, spacing, thumb structure, and Hindu Samudrika Shastra principles
- Use positive, empowering language — "signals suggest", "indicates potential" — never fatalistic
- Never invent company names, colleague names, or specific incidents
- Abstract profession to SECTOR ("technical analytical work", "healing professions", "creative arts")

## ANALYSIS FRAMEWORK

### 1. HAND TYPE — Earth / Air / Fire / Water
Analyze hand shape, palm width vs finger length, skin texture, finger spacing. Each type reveals personality archetype, temperament, elemental nature.

### 2. FINGERS & THUMB
- Each finger's length, bend, spacing, dominance
- Finger-planet associations: Index=Jupiter(leadership), Middle=Saturn(karma), Ring=Sun(creativity), Little=Mercury(communication), Thumb=Will+Logic
- Thumb: will phalanx vs logic phalanx ratio, flexibility, set angle — reveals willpower, emotional control, leadership capacity

### 3. MOUNTS (9 Parvats — Navagraha)
Mount of Jupiter (index base), Saturn (middle base), Apollo/Sun (ring base), Mercury (little base), Venus (thumb thenar), Moon/Luna (lower hypothenar), Upper Mars (between heart-head, outer edge), Lower Mars (below Jupiter mount), Rahu/Plain of Mars (palm center). Rate each: flat/normal/prominent. Flat = deficiency; prominent = strength.

### 4. MAJOR LINES — Deep Analysis
For EACH line identify: length, depth, curvature, breaks, forks, islands, chains, crosses, double lines, sister lines, timing markers.

- LIFE LINE (Ayu/Jeevan Rekha): Curves around Venus mount — NOT length = lifespan; depth = energy quality; width = physical constitution; branch upward = success; branch downward = loss; island = health event. Timing: wrist=birth, junction with head line=childhood, 1/3 down=~20s, midpoint=~35-40, 2/3=~50s
- HEART LINE (Hridaya Rekha): Upper palm across, Mercury→Jupiter direction — ending under Jupiter = idealistic romantic; Saturn = practical; between them = balanced. Chains = emotional turbulence; curve upward = warm; straight = controlled
- HEAD LINE (Mastishka Rekha): Mental orientation — straight = analytical; sloping toward Moon = creative/imaginative; separation from Life Line = independence; attached = cautious; length = focus ability
- FATE LINE (Bhagya Rekha): Saturn influence — absent = free-form life; from wrist = early karma; from Life Line = family-bound career; from Moon = talent-driven; breaks = career shifts; islands = obstacles; timing: 35=midpoint

ALSO check: Sun Line (Apollo), Mercury/Health Line, Marriage Lines, Children Lines, Travel Lines

### 5. CAREER & MONEY
Best fields, business vs job aptitude, financial stability signs, foreign opportunity indicators (travel lines, Moon mount development), wealth-growth age windows from Fate+Sun line analysis.

### 6. LOVE & MARRIAGE
Marriage line count, length, depth, islands, forks. Heart line quality for emotional nature. Venus mount for physical vitality in relationships. Timing of significant relationships.

### 7. HEALTH ANALYSIS
Life line breaks/islands for health events. Health/Mercury line. Stress indicators in Head line. Venus mount for constitution. Luna mount for chronic conditions. Warning signs without creating fear.

### 8. SPIRITUALITY & KARMA
Moon mount prominence = intuition/psychic ability. Star on Jupiter mount = dharmic leadership. Mystic Cross between Head-Heart lines = metaphysical inclination. Past-life imprints from thumb base markings.

### 9. AGE-WISE PREDICTIONS
Map specific features to life periods: childhood (0-17), young adult (18-25), building years (26-35), prime (36-50), elder wisdom (50+).

### 10. SPECIAL SYMBOLS
Scan for: Star (★) = sudden fame/fortune at that mount; Triangle (△) = protected talent; Square (□) = protection during difficulty; Cross (✕) = obstacle or karmic lesson; Fish/Matsya at Life Line end = spiritual prosperity; Trident/Trishul on Sun/Jupiter = divine blessing; Mystic Cross between lines = occult talent; Yava on thumb IP joint = royal fortune; Shankh = devotion and scholarship.

### 11. LUCK & DESTINY SCORES
Score out of 10 based on line quality, mount development, and symbol presence:
Career, Wealth, Marriage, Health, Fame, Spiritual Growth.

### 12. FINAL SUMMARY
Strongest life strength, biggest challenge, hidden talent, most important future period (with age range), overall destiny statement.

## OUTPUT FORMAT
Return ONLY a valid JSON object — no markdown fences, no text outside JSON.
All polyline coordinates: normalized floats [0.0, 1.0] where (0,0)=top-left, (1,1)=bottom-right.
Interpretation fields: write in the output language specified in the user message.`;

/* -------------------------------------------------------------------------- */
/*  JSON schema                                                               */
/* -------------------------------------------------------------------------- */

const JSON_SCHEMA = `{
  "imageQuality": {
    "score": "number 0-10 — overall photo clarity for palm reading",
    "rating": "excellent|good|fair|poor",
    "lineVisibility": "number 0-10 — how clearly the major creases are visible",
    "lighting": "number 0-10 — even lighting without harsh shadows or blowout",
    "focus": "number 0-10 — image sharpness, no motion blur",
    "framing": "number 0-10 — palm fills the frame, fingers spread, wrist visible",
    "notes": "string — one sentence: what limits the reading if quality is low, or what makes it strong"
  },
  "handType": {
    "element": "Earth|Air|Fire|Water",
    "palmShape": "square|rectangular|narrow|wide",
    "skinTexture": "coarse|medium|fine",
    "fingerLength": "short|medium|long relative to palm",
    "personalityProfile": "2-3 sentence personality archetype",
    "temperament": "string",
    "nature": "string"
  },
  "thumbAnalysis": {
    "willPhalanx": "long|medium|short",
    "logicPhalanx": "long|medium|short",
    "flexibility": "stiff|normal|flexible|hypermobile",
    "setAngle": "high|medium|low",
    "willpower": "string",
    "leadership": "string",
    "emotionalControl": "string",
    "interpretation": "string"
  },
  "fingerAnalysis": {
    "index":  { "length": "long|medium|short", "bent": "yes|no", "interpretation": "string" },
    "middle": { "length": "long|medium|short", "bent": "yes|no", "interpretation": "string" },
    "ring":   { "length": "long|medium|short", "bent": "yes|no", "interpretation": "string" },
    "little": { "length": "long|medium|short", "bent": "yes|no", "interpretation": "string" },
    "fingerGaps": "string",
    "fingerDominance": "index|middle|ring|little",
    "overallInterpretation": "string"
  },
  "mounts": {
    "jupiter":     { "development": "flat|normal|prominent", "interpretation": "string" },
    "saturn":      { "development": "flat|normal|prominent", "interpretation": "string" },
    "apollo":      { "development": "flat|normal|prominent", "interpretation": "string" },
    "mercury":     { "development": "flat|normal|prominent", "interpretation": "string" },
    "venus":       { "development": "flat|normal|prominent", "interpretation": "string" },
    "luna":        { "development": "flat|normal|prominent", "interpretation": "string" },
    "mars_upper":  { "development": "flat|normal|prominent", "interpretation": "string" },
    "mars_lower":  { "development": "flat|normal|prominent", "interpretation": "string" },
    "rahu_plain":  { "development": "flat|normal|prominent", "interpretation": "string" }
  },
  "majorLines": {
    "lifeLine":  {
      "present": true, "length": "short|medium|long", "depth": "faint|medium|deep",
      "curvature": "string", "breaks": 0, "islands": 0, "chains": false, "forks": "string",
      "branches": "string", "doubleLine": false, "sisterLine": false,
      "timingPredictions": "string — map features to approximate ages",
      "interpretation": "string",
      "polyline": [[0.0,0.0],[0.1,0.1],[0.2,0.2],[0.3,0.3],[0.4,0.4]],
      "svgPath": "M x,y L x,y ..."
    },
    "heartLine": {
      "present": true, "length": "string", "depth": "string", "startPoint": "string",
      "curvature": "string", "chains": false, "islands": 0, "forks": "string",
      "endingPosition": "under Jupiter|Saturn|between|percussion",
      "doubleLine": false,
      "timingPredictions": "string",
      "interpretation": "string",
      "polyline": [[0.0,0.0],[0.1,0.1],[0.2,0.2],[0.3,0.3],[0.4,0.4]],
      "svgPath": "M x,y L x,y ..."
    },
    "headLine":  {
      "present": true, "length": "string", "depth": "string", "direction": "string",
      "separation": "attached to life|separated|very separated",
      "slope": "straight|slight slope|steep slope toward Moon",
      "breaks": 0, "islands": 0, "forks": "string",
      "timingPredictions": "string",
      "interpretation": "string",
      "polyline": [[0.0,0.0],[0.1,0.1],[0.2,0.2],[0.3,0.3],[0.4,0.4]],
      "svgPath": "M x,y L x,y ..."
    },
    "fateLine":  {
      "present": true, "startPoint": "string", "length": "string", "depth": "string",
      "breaks": 0, "islands": 0, "doublings": "string",
      "timingPredictions": "string — ages 20/35/50 markers",
      "interpretation": "string",
      "polyline": [[0.0,0.0],[0.1,0.1],[0.2,0.2],[0.3,0.3],[0.4,0.4]],
      "svgPath": "M x,y L x,y ..."
    },
    "sunLine":   { "present": false, "strength": "faint|medium|strong", "timingPredictions": "string", "interpretation": "string" },
    "mercuryLine": { "present": false, "interpretation": "string" }
  },
  "minorLines": {
    "marriageLines": { "count": 0, "dominant": "string", "islands": false, "forks": false, "timingPredictions": "string", "interpretation": "string" },
    "childrenLines": { "count": 0, "interpretation": "string" },
    "travelLines":   { "count": 0, "interpretation": "string" },
    "marsLine":      { "present": false, "interpretation": "string" },
    "intuitonLine":  { "present": false, "interpretation": "string" }
  },
  "careerAndMoney": {
    "bestFields": ["string"],
    "businessVsJob": "string",
    "financialStability": "string",
    "wealthGrowthPeriods": ["string — age range and reason"],
    "foreignOpportunities": "string",
    "successTiming": "string",
    "overallOutlook": "string"
  },
  "loveAndMarriage": {
    "emotionalNature": "string",
    "loveLine": "string",
    "marriageTiming": "string",
    "relationshipStability": "string",
    "heartbreakRisk": "string",
    "compatibilityNature": "string",
    "overallOutlook": "string"
  },
  "healthAnalysis": {
    "stressIndicators": "string",
    "energyLevels": "string",
    "emotionalHealth": "string",
    "possibleConcerns": ["string"],
    "constitution": "string",
    "recommendations": "string"
  },
  "spiritualityAndKarma": {
    "spiritualInclination": "string",
    "intuitionPower": "string",
    "karmaIndicators": "string",
    "religiousTendencies": "string",
    "pastLifeImprints": "string",
    "soulPurpose": "string",
    "mysticCross": false
  },
  "ageWisePredictions": {
    "childhood":  "string — key formative influences visible in the hand",
    "age18to25":  "string — early adult phase: education, first career steps, first relationships",
    "age26to35":  "string — building phase: career consolidation, marriage, family",
    "age36to50":  "string — prime phase: peak career, wealth accumulation, major life events",
    "age50plus":  "string — wisdom phase: legacy, spiritual growth, health focus"
  },
  "specialSymbols": {
    "star":       { "present": false, "location": "string", "interpretation": "string" },
    "triangle":   { "present": false, "location": "string", "interpretation": "string" },
    "fish":       { "present": false, "location": "string", "interpretation": "string" },
    "trident":    { "present": false, "location": "string", "interpretation": "string" },
    "square":     { "present": false, "location": "string", "interpretation": "string" },
    "cross":      { "present": false, "location": "string", "interpretation": "string" },
    "mysticCross":{ "present": false, "location": "string", "interpretation": "string" },
    "yava":       { "present": false, "location": "string", "interpretation": "string" },
    "shankh":     { "present": false, "location": "string", "interpretation": "string" },
    "other":      ["string — describe any other rare marking observed"]
  },
  "luckyDestinyScore": {
    "career":         { "score": 7, "reasoning": "string" },
    "wealth":         { "score": 7, "reasoning": "string" },
    "marriage":       { "score": 7, "reasoning": "string" },
    "health":         { "score": 7, "reasoning": "string" },
    "fame":           { "score": 7, "reasoning": "string" },
    "spiritualGrowth":{ "score": 7, "reasoning": "string" }
  },
  "finalSummary": {
    "strongestStrength": "string",
    "biggestChallenge":  "string",
    "hiddenTalent":      "string",
    "importantFuturePeriod": "string — age range and what it brings",
    "overallDestiny":    "string — 2-3 sentence poetic destiny statement"
  },
  "specialMarkings": ["string — any additional markings"],
  "overallPersonality": "string",
  "careerSuggestions": ["string"],
  "healthWarnings": ["string"],
  "relationshipOutlook": "string",
  "financialOutlook": "string",
  "luckyPeriods": ["string"],
  "remedies": ["string — mantra/gemstone/charity recommendation"],
  "vedicCorrelation": "string",
  "panditMessage": "string — poetic blessing from Pandit Hastamani Shastri",
  "summary": ["hook sentence", "nuance insight", "action guidance"],
  "novaCanvasPrompt": "English prompt for Nova Canvas to generate a perfected biometric hand map"
}`;

/* -------------------------------------------------------------------------- */
/*  User prompt builder                                                       */
/* -------------------------------------------------------------------------- */

function buildUserPrompt(
  hand: 'left' | 'right',
  reportDepth: ReportDepth,
  language: string,
  kundliBlock?: string,
  lifeContext?: string,
  hasLineHighlight?: boolean,
): string {
  const gender = hand === 'right' ? 'MALE' : 'FEMALE';
  const karmaType = hand === 'right'
    ? 'Karma Hast (active karma — current destiny being created)'
    : 'Janma Hast (birth blueprint — Sanchita karma from past lives)';

  const imageGuide = hasLineHighlight
    ? `Three images provided:\n` +
      `• Image 1: Original color photo — use for hand shape, skin texture, mounts, finger length.\n` +
      `• Image 2: CLAHE-enhanced greyscale — use for detecting faint or shallow lines.\n` +
      `• Image 3: Neon teal overlay — the bright teal lines are pre-detected palm creases drawn by an edge-detection algorithm. Use these highlighted paths to trace EXACT polyline coordinates for Life, Heart, Head, and Fate lines. Trust Image 3 geometry over your own line estimation when they differ.\n\n`
    : `Two images provided:\n` +
      `• Image 1: Original color photo — hand shape, mounts, skin texture.\n` +
      `• Image 2: CLAHE-enhanced greyscale — fine line detection.\n\n`;

  let prompt =
    `${imageGuide}Analyze this ${hand.toUpperCase()} hand.\n` +
    `• Hand type: ${karmaType}\n` +
    `• Read as: ${gender}\n` +
    `• Report depth: ${DEPTH_INSTRUCTION[reportDepth]}\n` +
    `• Output language: Write ALL interpretation, prediction, and description fields in ${language}. Use ${language} naturally — technical Samudrika Shastra terms may appear in Sanskrit/Hindi with ${language} explanation in parentheses.\n\n` +
    `Perform the complete 13-section analysis:\n` +
    `1. Hand Type (Earth/Air/Fire/Water) with personality traits\n` +
    `2. Finger analysis — length, bend, gaps, dominance, each finger's planetary meaning\n` +
    `3. Thumb analysis — will phalanx, logic phalanx, flexibility, leadership indicators\n` +
    `4. All 9 Mounts (Navagraha Parvats) — strength and life effect of each\n` +
    `5. Major Lines — Life, Heart, Head, Fate, Sun, Mercury with length/depth/curves/breaks/forks/islands/timing\n` +
    `6. Career & Money — best fields, business vs job, wealth periods, foreign opportunities\n` +
    `7. Love & Marriage — emotional nature, timing, stability, heartbreak risk\n` +
    `8. Health Analysis — stress indicators, energy, constitution, concerns\n` +
    `9. Spirituality & Karma — intuition, karma indicators, soul purpose, past-life imprints\n` +
    `10. Age-wise Predictions — childhood, 18-25, 26-35, 36-50, 50+\n` +
    `11. Special Symbols — Star, Triangle, Fish, Trident, Square, Cross, Mystic Cross, Yava, Shankh\n` +
    `12. Luck & Destiny Scores — Career/Wealth/Marriage/Health/Fame/Spiritual each out of 10\n` +
    `13. Final Summary — strongest strength, biggest challenge, hidden talent, important future period, destiny statement\n\n` +
    `Assess image quality first. If lines are unclear, note it but still provide your best reading.\n` +
    `All polyline arrays: normalized [0.0, 1.0] floats.\n` +
    `Return ONLY a valid JSON object matching the exact schema. No markdown fences.\n\n` +
    `${JSON_SCHEMA}`;

  if (kundliBlock) prompt += `\n\nBirth Chart Context: ${kundliBlock}`;
  if (lifeContext) prompt += `\n\n${lifeContext}`;

  return prompt;
}

/* -------------------------------------------------------------------------- */
/*  Request body builder                                                      */
/* -------------------------------------------------------------------------- */

type ExtendedInput = PalmAnalysisInput & {
  reportDepth?: ReportDepth;
  language?: string;
  lineHighlighted?: { data: string; mediaType: 'image/jpeg' };
};

function buildBody(input: ExtendedInput): Record<string, unknown> {
  const depth = input.reportDepth ?? 'full';
  const language = input.language ?? 'English';

  const kundliBlock = input.kundli
    ? [
        input.kundli.ascendantSign && `Ascendant: ${input.kundli.ascendantSign}`,
        input.kundli.moonSign && `Moon sign: ${input.kundli.moonSign}`,
        input.kundli.currentMahadasha && `Current Mahadasha: ${input.kundli.currentMahadasha}`,
      ]
        .filter(Boolean)
        .join(', ')
    : undefined;

  // Build image blocks: color + CLAHE-enhanced + neon line overlay (when available)
  const imageBlocks: unknown[] = [
    {
      type: 'image',
      source: { type: 'base64', media_type: input.color.mediaType, data: input.color.data },
    },
    {
      type: 'image',
      source: { type: 'base64', media_type: (input.enhanced ?? input.color).mediaType, data: (input.enhanced ?? input.color).data },
    },
  ];

  if (input.lineHighlighted) {
    imageBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: input.lineHighlighted.mediaType, data: input.lineHighlighted.data },
    });
  }

  return {
    anthropic_version: BEDROCK_VERSION,
    max_tokens: DEPTH_TOKENS[depth],
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          {
            type: 'text',
            text: buildUserPrompt(input.hand, depth, language, kundliBlock, input.lifeContext, !!input.lineHighlighted),
          },
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Response parsing                                                          */
/* -------------------------------------------------------------------------- */

function extractText(res: unknown): string {
  const msg = res as { content?: Array<{ type: string; text?: string }> };
  return msg.content?.find((b) => b.type === 'text')?.text ?? '{}';
}

function safeParse(raw: string): Record<string, unknown> {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
  } catch { /* continue */ }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    } catch { /* fall through */ }
  }

  return {};
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

export async function analyzePalmBedrock(
  input: ExtendedInput,
): Promise<Record<string, unknown>> {
  const body = buildBody(input);
  const res = await invokeModel(VISION_MODEL, body);
  const text = extractText(res);
  const parsed = safeParse(text);
  return { handType: input.hand, reportDepth: input.reportDepth ?? 'full', language: input.language ?? 'English', ...parsed };
}

export async function* streamPalmBedrock(
  input: ExtendedInput,
): AsyncGenerator<{ stage: string; data: Record<string, unknown> }> {
  const body = buildBody(input);
  let buffer = '';
  for await (const chunk of invokeModelStream(VISION_MODEL, body)) {
    buffer += chunk;
  }
  const parsed = safeParse(buffer);
  const result: Record<string, unknown> = { handType: input.hand, reportDepth: input.reportDepth ?? 'full', language: input.language ?? 'English', ...parsed };

  yield {
    stage: 'lines',
    data: {
      handType: result.handType,
      imageQuality: result.imageQuality,
      handShape: result.handShape,
      majorLines: result.majorLines,
      thumbAnalysis: result.thumbAnalysis,
      fingerAnalysis: result.fingerAnalysis,
    },
  };

  yield {
    stage: 'soul',
    data: {
      mounts: result.mounts,
      minorLines: result.minorLines,
      careerAndMoney: result.careerAndMoney,
      loveAndMarriage: result.loveAndMarriage,
      healthAnalysis: result.healthAnalysis,
      spiritualityAndKarma: result.spiritualityAndKarma,
      ageWisePredictions: result.ageWisePredictions,
      specialSymbols: result.specialSymbols,
      luckyDestinyScore: result.luckyDestinyScore,
      finalSummary: result.finalSummary,
      specialMarkings: result.specialMarkings,
      summary: result.summary,
      overallPersonality: result.overallPersonality,
      careerSuggestions: result.careerSuggestions,
      healthWarnings: result.healthWarnings,
      relationshipOutlook: result.relationshipOutlook,
      financialOutlook: result.financialOutlook,
      luckyPeriods: result.luckyPeriods,
      remedies: result.remedies,
      vedicCorrelation: result.vedicCorrelation,
      panditMessage: result.panditMessage,
      novaCanvasPrompt: result.novaCanvasPrompt,
      reportDepth: result.reportDepth,
      language: result.language,
    },
  };
}
