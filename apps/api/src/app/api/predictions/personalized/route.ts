import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { deductCredits, refundCredits } from '@/lib/credits/deductCredits';
import { VOICE_RULES } from '@/lib/ai/voiceRules';
import type { ApiResponse } from '@aroha-astrology/shared';

// ============================================================
// POST /api/predictions/personalized
// Generates daily/weekly/monthly/yearly predictions based on
// the native's chart, current dasha, yogas, and doshas.
// ============================================================

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface PersonalizedRequest {
  chartId: string;
  period: Period;
}

function buildPrompt(period: Period, context: Record<string, unknown>): string {
  const periodDescriptions: Record<Period, string> = {
    daily: 'today (the next 24 hours)',
    weekly: 'this week (the next 7 days)',
    monthly: 'this month (the next 30 days)',
    yearly: `this year (${new Date().getFullYear()})`,
  };

  return `You are a master Vedic astrologer providing a ${period} prediction.

${VOICE_RULES}

CHART CONTEXT:
${JSON.stringify(context, null, 1)}

Generate a personalized ${period} prediction for ${periodDescriptions[period]}.

Base your analysis on:
1. The current Mahadasha and Antardasha lords, and the houses they rule
2. Active yogas and doshas in the chart
3. The native's ascendant, Moon sign, and Nakshatra
4. Planet dignities and strengths

The "summary" field is the H/N/A 3-line structure — an ARRAY OF EXACTLY THREE STRINGS:
  [0] HOOK — 1–2 short sentences naming what's most alive in this ${period} for the native.
  [1] NUANCE — 1–2 short sentences with the planetary why (dasha/transit).
  [2] ACTION — 1–2 short sentences with one concrete thing to do this ${period}.
Short sentences only.

Respond ONLY with valid JSON in this exact format (no markdown fences):
{
  "summary": ["hook", "nuance", "action"],
  "period": "${period}",
  "ruling_dasha": "<Planet> Mahadasha / <Planet> Antardasha",
  "activated_houses": "<houses activated by dasha lords>",
  "prediction": {
    "overall": "<2-3 sentence overall prediction for the period>",
    "career": "<career prediction, 2-3 sentences>",
    "relationships": "<relationships prediction, 2-3 sentences>",
    "health": "<health prediction, 2-3 sentences>",
    "finance": "<finance prediction, 2-3 sentences>",
    "spiritual": "<spiritual prediction, 2-3 sentences>",
    "lucky_time": "<lucky time or hours for this period>",
    "lucky_color": "<lucky color>",
    "avoid": "<what to avoid during this period>",
    "remedy": "<specific Vedic remedy for this period>"
  }
}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let creditCharged = false;
  try {
    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Personalized predictions');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }
    creditCharged = true;

    const body: PersonalizedRequest = await request.json();
    const { chartId, period } = body;

    if (!chartId || !period) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'chartId and period are required' },
        { status: 400 },
      );
    }

    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(period)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'period must be daily, weekly, monthly, or yearly' },
        { status: 400 },
      );
    }

    // Fetch chart data
    const { data: chart, error: chartError } = await supabase
      .from('kundli_charts')
      .select(`
        *,
        birth_profiles (
          name, dob, tob, pob, gender
        )
      `)
      .eq('id', chartId)
      .eq('user_id', user.id)
      .single();

    if (chartError || !chart) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Chart not found' },
        { status: 404 },
      );
    }

    // Build compact context for the AI
    const chartData = chart.chart_data as Record<string, unknown>;
    const dashaData = chart.dasha_data as Record<string, unknown>;
    const yogaData = chart.yoga_data as unknown[];
    const doshaData = chart.dosha_data as Record<string, unknown>;

    const vimshottari = (dashaData?.vimshottari ?? {}) as Record<string, unknown>;
    const currentMD = vimshottari.currentMahadasha as Record<string, unknown> | undefined;
    const currentAD = vimshottari.currentAntardasha as Record<string, unknown> | undefined;

    const context = {
      profile: chart.birth_profiles,
      currentDate: new Date().toISOString().split('T')[0],
      ascendant: (chartData as Record<string, unknown>)?.ascendant,
      planets: (chartData as Record<string, unknown>)?.planets,
      houses: (chartData as Record<string, unknown>)?.houses,
      currentDasha: {
        mahadasha: currentMD ? { planet: currentMD.planet, startDate: currentMD.startDate, endDate: currentMD.endDate } : null,
        antardasha: currentAD ? { planet: currentAD.planet, startDate: currentAD.startDate, endDate: currentAD.endDate } : null,
      },
      yogas: Array.isArray(yogaData) ? yogaData.filter((y: unknown) => (y as Record<string, unknown>).present).slice(0, 10) : [],
      doshas: doshaData,
    };

    const prompt = buildPrompt(period, context);

    const message = await createAIMessage({
      max_tokens: 2048,
      jsonMode: true,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const rawContent = textBlock?.text ?? '{}';

    let predictionContent: Record<string, unknown>;
    try {
      const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      predictionContent = JSON.parse(cleaned);
    } catch {
      predictionContent = {
        period,
        ruling_dasha: 'Unknown',
        activated_houses: 'Unknown',
        prediction: {
          overall: rawContent.slice(0, 500),
          career: 'Unable to parse structured prediction.',
          relationships: '',
          health: '',
          finance: '',
          spiritual: '',
          lucky_time: '',
          lucky_color: '',
          avoid: '',
          remedy: '',
        },
      };
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: predictionContent,
    });
  } catch (error) {
    if (creditCharged) {
      await refundCredits(supabase, user.id, 1, 'Refund: Personalized predictions (AI error)');
    }
    console.error('Personalized prediction error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate prediction',
      },
      { status: 500 },
    );
  }
}
