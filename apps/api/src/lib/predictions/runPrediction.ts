import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { getAgeDemographic, buildToneRules, type AgeDemographic } from '@/lib/ai/toneRouting';
import { POLICY_SYSTEM_DIRECTIVE } from '@/lib/ai/contentPolicy';

const ALL_PREDICTION_TYPES = [
  'personality',
  'career',
  'health',
  'marriage',
  'wealth',
  'children',
  'education',
] as const;

export type PredictionType = typeof ALL_PREDICTION_TYPES[number];
export { ALL_PREDICTION_TYPES };

const PREDICTION_TYPE_FOCUS: Record<string, string> = {
  personality: 'personality, character traits, mental tendencies, and self-expression',
  career: 'career, profession, job prospects, business, and professional growth',
  health: 'physical health, mental wellbeing, disease tendencies, and vitality',
  marriage: 'marriage timing, spouse qualities, relationship harmony, and partnership',
  wealth: 'finances, wealth accumulation, income, investments, and financial stability',
  children: 'children — fertility, timing of childbirth, child count, child wellbeing, and parenting',
  education: 'education, learning, academic success, higher studies, and intellectual pursuits',
};

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

function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    hi: 'Hindi', ta: 'Tamil', te: 'Telugu', bn: 'Bengali',
    gu: 'Gujarati', mr: 'Marathi', kn: 'Kannada', ml: 'Malayalam', en: 'English',
  };
  return names[code] || 'English';
}

function buildSystemPrompt(type: string, language: string, ageDemographic: AgeDemographic | null): string {
  const focusArea = PREDICTION_TYPE_FOCUS[type] ?? type;
  const toneDirective = `You are a wise and compassionate master Vedic astrologer. Present insights with sensitivity while remaining truthful. Balance difficult findings with constructive advice.`;
  const demographicTone = buildToneRules(ageDemographic, { harshMode: false });
  const languageDirective = language !== 'en'
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

IMPORTANT RULES:
1. FOCUS ONLY on ${focusArea} — every sentence must relate to this specific area.
2. Reference specific planetary positions, houses, and aspects relevant to ${focusArea}, quoting them from the chart context. Do NOT invent positions.
3. Mention the current Vimshottari Dasha-Antardasha period and its effect on ${focusArea}, using the dates exactly as given in the dashaData.
4. Cite specific yogas or doshas only if they appear in yogaData/doshaData with present:true.
5. Provide: current situation → short-term (6-12 months) → medium-term (1-3 years) → long-term — anchored in dasha periods.
6. Give specific remedies (mantras, gemstones, charity, fasting, puja) for improving ${focusArea}.
7. IMPORTANT: Return ONLY valid JSON. No prose before or after. No markdown fences.
8. Gender-aware language: for Male native say "your wife"/"she" for spouse; for Female native say "your husband"/"he"; if unknown use "your spouse"/"they".
9. favorablePeriods and unfavorablePeriods MUST quote dasha boundaries verbatim from dashaData. Do NOT invent date ranges.

Return ONLY this JSON (no other text):
{
  ${summarySchema},
  "detailedAnalysis": [{"area": "string", "prediction": "string", "confidence": "high|medium|low", "planetaryBasis": "string", "timeline": "string"}],
  "currentPeriod": {"dasha": "string", "antardasha": "string", "effects": "string", "startDate": "string", "endDate": "string"},
  "remedies": [{"type": "mantra|gemstone|charity|fasting|puja|yantra|rudraksha", "description": "string", "planet": "string", "urgency": "high|medium|low", "instructions": "string"}],
  "warnings": ["string"],
  "favorablePeriods": ["string"],
  "unfavorablePeriods": ["string"]
}`;
}

function extractPredictionJSON(raw: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch { return null; }
  };
  const direct = tryParse(raw.trim());
  if (direct) return direct;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const inFence = tryParse(fenceMatch[1].trim());
    if (inFence) return inFence;
  }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) return tryParse(raw.slice(first, last + 1));
  return null;
}

export type RunPredictionResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Generate a single prediction for a chart and write it to the predictions table.
 * No credit deduction — intended for background auto-generation on chart creation.
 * Idempotent: skips silently if a prediction of this type already exists.
 */
export async function runPrediction(
  supabase: SupabaseClient,
  userId: string,
  chartId: string,
  type: string,
  language = 'en',
): Promise<RunPredictionResult> {
  // Skip if already exists
  const { data: existing } = await supabase
    .from('predictions')
    .select('id')
    .eq('chart_id', chartId)
    .eq('user_id', userId)
    .eq('type', type)
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: true };

  const { data: chart, error: chartError } = await supabase
    .from('kundli_charts')
    .select('chart_data, divisional_charts, dasha_data, yoga_data, dosha_data, shadbala, ashtakavarga, panchang_at_birth, birth_profiles(name, dob, tob, tob_source, pob, gender)')
    .eq('id', chartId)
    .eq('user_id', userId)
    .single();

  if (chartError || !chart) return { ok: false, reason: 'chart not found' };

  const dob = (chart.birth_profiles as { dob?: string } | null)?.dob ?? null;
  const ageDemographic = getAgeDemographic(dob);
  const systemPrompt = buildSystemPrompt(type, language, ageDemographic);

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
    currentDate: new Date().toISOString(),
  };

  let rawContent: string;
  try {
    const message = await createAIMessage({
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Generate a ${type} prediction for this chart:\n${JSON.stringify(chartContext)}` }],
    });
    rawContent = message.content.find(b => b.type === 'text')?.text ?? '{}';
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  const parsed = extractPredictionJSON(rawContent);
  if (!parsed) return { ok: false, reason: 'unparseable AI output' };

  const validation = PredictionContentSchema.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.errors.slice(0, 3).map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { ok: false, reason: `schema validation failed: ${issues}` };
  }

  const { error: insertErr } = await supabase
    .from('predictions')
    .insert({
      chart_id: chartId,
      user_id: userId,
      type,
      harsh_mode: false,
      content: validation.data as unknown as Record<string, unknown>,
      language,
    });

  if (insertErr) return { ok: false, reason: insertErr.message };
  return { ok: true };
}
