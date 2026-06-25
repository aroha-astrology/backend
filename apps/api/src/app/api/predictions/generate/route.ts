import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { deductCredits, refundCredits } from '@/lib/credits/deductCredits';
import { getAgeDemographic, buildToneRules, type AgeDemographic } from '@/lib/ai/toneRouting';
import { POLICY_SYSTEM_DIRECTIVE, classifyUserMessage } from '@/lib/ai/contentPolicy';
import type { ApiResponse, GeneratePredictionRequest } from '@aroha-astrology/shared';

// Zod schema for the LLM's structured output. Catches missing/malformed fields
// before they get stored as a "valid" prediction. Strict on shape, lenient on content.
const PredictionContentSchema = z.object({
  summary: z.union([
    z.string().min(20),
    z.array(z.string().min(5)).min(1),
  ]),
  detailedAnalysis: z.array(z.object({
    area: z.string().min(1),
    prediction: z.string().min(20),
    confidence: z.enum(['high', 'medium', 'low']).optional(),
    planetaryBasis: z.string().optional(),
    timeline: z.string().optional(),
  })).min(1),
  currentPeriod: z.object({
    dasha: z.string().optional(),
    antardasha: z.string().optional(),
    effects: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }).optional(),
  remedies: z.array(z.object({
    type: z.string(),
    description: z.string().min(5),
    planet: z.string().optional(),
    urgency: z.enum(['high', 'medium', 'low']).optional(),
    instructions: z.string().optional(),
  })).min(1),
  warnings: z.array(z.string()).optional(),
  favorablePeriods: z.array(z.string()).optional(),
  unfavorablePeriods: z.array(z.string()).optional(),
});

// ============================================================
// System prompt for Vedic astrology predictions
// ============================================================

const PREDICTION_TYPE_FOCUS: Record<string, string> = {
  personality: 'personality, character traits, mental tendencies, and self-expression',
  career: 'career, profession, job prospects, business, and professional growth',
  health: 'physical health, mental wellbeing, disease tendencies, and vitality',
  marriage: 'marriage timing, spouse qualities, relationship harmony, and partnership',
  wealth: 'finances, wealth accumulation, income, investments, and financial stability',
  children: 'children — fertility, timing of childbirth, child count, child wellbeing, and parenting',
  education: 'education, learning, academic success, higher studies, and intellectual pursuits',
  travel: 'travel, foreign settlements, and long-distance journeys',
  spirituality: 'spiritual growth, moksha, and religious inclinations',
};

function buildSystemPrompt(
  harshMode: boolean,
  language: string,
  type: string,
  ageDemographic: AgeDemographic | null,
): string {
  const focusArea = PREDICTION_TYPE_FOCUS[type] ?? type;

  const toneDirective = harshMode
    ? `You are a BRUTALLY HONEST master Vedic astrologer. Do NOT sugarcoat. If the chart shows difficulties, say so directly.
       Use phrases like "Your chart clearly indicates...", "There is no escaping the fact that...", "The planetary alignment is unfavorable for...".
       Still provide remedies, but be frank about the challenges. Think of yourself as a strict but caring guru who tells hard truths.`
    : `You are a wise and compassionate master Vedic astrologer. Present insights with sensitivity while remaining truthful.
       Balance difficult findings with constructive advice. Use encouraging language while being honest about challenges.`;

  const demographicTone = buildToneRules(ageDemographic, { harshMode });

  const languageDirective =
    language !== 'en'
      ? `Respond primarily in ${getLanguageName(language)} with key Vedic terms in Sanskrit/Hindi transliteration.`
      : `Respond in English with key Vedic terms in Sanskrit/Hindi transliteration.`;

  const summarySchema = ageDemographic
    ? `"summary": ["hook sentence(s) about ${focusArea}", "nuance sentence(s) with planetary basis", "action sentence(s) for this week"]`
    : `"summary": "2-3 sentence overview focused on ${focusArea}"`;

  return `${POLICY_SYSTEM_DIRECTIVE}

${toneDirective}
${demographicTone ? `\n${demographicTone}\n` : ''}
${languageDirective}

CRITICAL: You are generating a prediction SPECIFICALLY and EXCLUSIVELY about: ${focusArea.toUpperCase()}.
Do NOT write a general comprehensive report. Do NOT cover other life areas. Stay strictly focused on ${focusArea}.

You are analyzing a Vedic birth chart (Kundli) with deep expertise in:
- Parashari system (primary)
- Jaimini principles (supplementary)
- Nadi astrology concepts
- Lal Kitab remedies

IMPORTANT RULES:
1. FOCUS ONLY on ${focusArea} — every sentence must relate to this specific area.
2. Reference specific planetary positions, houses, and aspects relevant to ${focusArea}, quoting them from the chart context provided in the user message. Do NOT invent positions.
3. Mention the current Vimshottari Dasha-Antardasha period and its effect on ${focusArea}, using the dates exactly as given in the dashaData.
4. Cite specific yogas or doshas only if they appear in yogaData/doshaData with present:true. Do not name a yoga that isn't in the context.
5. Provide: current situation → short-term (6-12 months) → medium-term (1-3 years) → long-term — anchored in dasha periods present in dashaData. If the dasha sequence in context doesn't reach a horizon, state "the chart's dasha sequence I have access to extends to <last endDate>" instead of inventing further.
6. Give specific remedies (mantras, gemstones, charity, fasting, puja) for improving ${focusArea}.
7. If follow-up answers are provided, incorporate them to refine the ${focusArea} predictions.
8. Use Ashtakavarga bindu counts for relevant houses.
9. IMPORTANT: Return ONLY valid JSON. No prose before or after. No markdown fences.
10. Gender-aware language: for Male native say "your wife"/"she" for spouse; for Female native say "your husband"/"he"; if unknown use "your spouse"/"they".
11. favorablePeriods and unfavorablePeriods MUST quote dasha boundaries verbatim from dashaData (e.g., "Jupiter MD: 2028-09-12 to 2044-09-12", "Saturn AD within Jupiter MD: 2031-04-30 to 2034-01-12"). Do NOT invent date ranges. If you can't anchor a period to dashaData, omit the entry rather than fabricate.

Return ONLY this JSON (no other text):
{
  ${summarySchema},
  "detailedAnalysis": [
    {
      "area": "specific aspect of ${focusArea}",
      "prediction": "detailed prediction for this aspect",
      "confidence": "high|medium|low",
      "planetaryBasis": "which planets/houses/yogas support this",
      "timeline": "when this manifests"
    }
  ],
  "currentPeriod": {
    "dasha": "string",
    "antardasha": "string",
    "effects": "how current dasha affects ${focusArea}",
    "startDate": "string",
    "endDate": "string"
  },
  "remedies": [
    {
      "type": "mantra|gemstone|charity|fasting|puja|yantra|rudraksha",
      "description": "string",
      "planet": "string",
      "urgency": "high|medium|low",
      "instructions": "string"
    }
  ],
  "warnings": ["string"],
  "favorablePeriods": ["string"],
  "unfavorablePeriods": ["string"]
}`;
}

// Try increasingly aggressive strategies to recover a JSON object from raw AI text.
// AI models often wrap JSON in ```json fences and sometimes add a prose preamble
// like "Below is the response..." before the fence — both must be stripped.
function extractPredictionJSON(raw: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  // 1. Direct parse
  const direct = tryParse(raw.trim());
  if (direct) return direct;

  // 2. Strip ```json ... ``` fences and try the contents
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const inFence = tryParse(fenceMatch[1].trim());
    if (inFence) return inFence;
  }

  // 3. Slice from the first { to the matching last } and try
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const sliced = tryParse(raw.slice(first, last + 1));
    if (sliced) return sliced;
  }

  return null;
}

function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    hi: 'Hindi',
    ta: 'Tamil',
    te: 'Telugu',
    bn: 'Bengali',
    gu: 'Gujarati',
    mr: 'Marathi',
    kn: 'Kannada',
    ml: 'Malayalam',
    en: 'English',
  };
  return names[code] || 'English';
}

// ============================================================
// POST /api/predictions/generate
// ============================================================

export const maxDuration = 300; // 10 minutes

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const body: GeneratePredictionRequest = await request.json();
    const { chartId, type, harshMode, language, followUpAnswers } = body;

    if (!chartId || !type) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'chartId and type are required' },
        { status: 400 },
      );
    }

    // Return existing prediction if one already exists — prevents duplicate charges and DB rows
    const { data: existing } = await supabase
      .from('predictions')
      .select('id, content, type')
      .eq('chart_id', chartId)
      .eq('user_id', user.id)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json<ApiResponse>({
        success: true,
        data: { predictionId: existing.id, type, content: existing.content },
      });
    }

    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Vedic prediction generation');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'INSUFFICIENT_TOKENS' } as ApiResponse,
        { status: 402 },
      );
    }

    // Fetch chart data
    const { data: chart, error: chartError } = await supabase
      .from('kundli_charts')
      .select('id, chart_data, divisional_charts, dasha_data, yoga_data, dosha_data, shadbala, ashtakavarga, panchang_at_birth, birth_profiles(name, dob, tob, tob_source, pob, gender)')
      .eq('id', chartId)
      .eq('user_id', user.id)
      .single();

    if (chartError || !chart) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Chart not found' },
        { status: 404 },
      );
    }

    // Strip any follow-up answers whose text probes the death/longevity topic —
    // we don't want such phrasing to enter the LLM context even via this side channel.
    const sanitizedFollowUps = (followUpAnswers ?? []).filter((fa) => {
      const text = `${fa?.question ?? ''} ${fa?.answer ?? ''}`;
      return !classifyUserMessage(text, language ?? 'en').blocked;
    });

    // Build context for AI
    const chartContext = {
      profile: chart.birth_profiles,
      predictionType: type,
      chartData: chart.chart_data,
      divisionalCharts: chart.divisional_charts,
      dashaData: chart.dasha_data,
      yogaData: chart.yoga_data,
      doshaData: chart.dosha_data,
      shadbala: chart.shadbala,
      ashtakavarga: chart.ashtakavarga,
      panchangAtBirth: chart.panchang_at_birth,
      followUpAnswers: sanitizedFollowUps,
      currentDate: new Date().toISOString(),
    };

    // Derive age demographic from birth profile DOB (no extra query — already in select)
    const dob = (chart.birth_profiles as { dob?: string } | null)?.dob ?? null;
    const ageDemographic = getAgeDemographic(dob);

    // Call AI for prediction
    const systemPrompt = buildSystemPrompt(harshMode ?? false, language ?? 'en', type, ageDemographic);

    const message = await createAIMessage({
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Generate a ${type} prediction for this chart:\n${JSON.stringify(chartContext)}`,
        },
      ],
    });

    // Extract text content from AI response
    const textBlock = message.content.find((block) => block.type === 'text');
    const rawContent = textBlock?.text ?? '{}';

    // Parse the JSON response — robust to prose preamble before/after the JSON block
    const parsed = extractPredictionJSON(rawContent);

    // Validate against Zod schema. If the model returned malformed/incomplete output,
    // refuse to store it and refund the credit. This stops fallback-masked hallucination
    // (where a refused/garbled response gets stored as if it were a real prediction).
    if (!parsed) {
      console.warn(`[predictions/generate] JSON parse failed for type=${type}, refunding credit`);
      await refundCredits(supabase, user.id, 1, `Refund: ${type} prediction generation failed (unparseable AI output)`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'AI output could not be parsed. Your tokens have been refunded — please try again.' },
        { status: 502 },
      );
    }

    const validation = PredictionContentSchema.safeParse(parsed);
    if (!validation.success) {
      const issues = validation.error.errors.slice(0, 3).map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      console.warn(`[predictions/generate] schema validation failed for type=${type}: ${issues} | refunding credit`);
      await refundCredits(supabase, user.id, 1, `Refund: ${type} prediction failed validation (${issues.slice(0, 100)})`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'AI output failed validation. Your tokens have been refunded — please try again.' },
        { status: 502 },
      );
    }

    const predictionContent: Record<string, unknown> = validation.data as unknown as Record<string, unknown>;

    // Store prediction in database
    const { data: prediction, error: predError } = await supabase
      .from('predictions')
      .insert({
        chart_id: chartId,
        user_id: user.id,
        type,
        harsh_mode: harshMode ?? false,
        content: predictionContent,
        follow_up_answers: followUpAnswers
          ? (followUpAnswers as unknown as Record<string, unknown>)
          : null,
        language: language ?? 'en',
      })
      .select()
      .single();

    if (predError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to store prediction: ${predError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        predictionId: prediction.id,
        type,
        content: predictionContent,
      },
    });
  } catch (error) {
    console.error('Prediction generation error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate prediction',
      },
      { status: 500 },
    );
  }
}
