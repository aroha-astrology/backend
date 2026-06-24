import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { deductCredits, refundCredits } from '@/lib/credits/deductCredits';
import { getAgeDemographic, buildToneOnly } from '@/lib/ai/toneRouting';
import { VOICE_RULES } from '@/lib/ai/voiceRules';
import type { ApiResponse } from '@aroha-astrology/shared';

// ============================================================
// POST /api/dreams
// ============================================================

export const maxDuration = 60; // 60s max

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let creditCharged = false;
  try {
    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Dream interpretation');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }
    creditCharged = true;

    const body = await request.json();
    const { dream, chartId } = body as {
      dream: string;
      chartId?: string;
    };

    if (!dream || dream.trim().length < 20) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Please describe your dream in at least 20 characters' },
        { status: 400 },
      );
    }

    // If chartId provided, fetch chart for astrological context
    let chartContext = '';
    let dob: string | null = null;
    if (chartId) {
      const { data: chart } = await supabase
        .from('kundli_charts')
        .select('dasha_data, birth_profiles(dob)')
        .eq('id', chartId)
        .eq('user_id', user.id)
        .single();

      if (chart) {
        const dashaData = chart.dasha_data as Record<string, unknown>;
        const vimsh = (dashaData?.vimshottari as Record<string, unknown> | undefined);
        const md = (vimsh?.currentMahadasha as Record<string, unknown> | undefined)?.planet;
        const ad = (vimsh?.currentAntardasha as Record<string, unknown> | undefined)?.planet;
        if (md) chartContext = ` Current dasha: ${md}${ad ? `/${ad}` : ''}.`;
        const profile = Array.isArray(chart.birth_profiles) ? chart.birth_profiles[0] : chart.birth_profiles;
        dob = (profile as { dob?: string } | null)?.dob ?? null;
      }
    }

    const demographic = getAgeDemographic(dob);
    const toneBlock = buildToneOnly(demographic);

    // Call AI for dream interpretation — fast model, tight token budget
    const message = await createAIMessage({
      model: process.env.NVIDIA_NIM_FAST_MODEL ?? 'meta/llama-3.1-8b-instruct',
      max_tokens: 800,
      temperature: 0.25,
      skipPersona: true,
      jsonMode: true,
      signal: AbortSignal.timeout(25_000),
      system: `You are a Vedic dream interpreter (Swapna Shastra). Return ONLY valid JSON — no markdown, no extra text.

${VOICE_RULES}

${toneBlock}

JSON schema (fill EVERY field — never use empty strings ""):
{"overall_interpretation":"2-3 sentence summary","auspiciousness":"auspicious|inauspicious|neutral","astrological_connection":"1 sentence","positive_points":["uplifting aspect 1","uplifting aspect 2"],"issues":["challenge or warning 1"],"symbols":[{"symbol":"name","vedic_meaning":"1-2 sentences","psychological_meaning":"1-2 sentences"}],"remedies":["specific remedy 1","specific remedy 2"],"lucky_numbers":[0,0,0]}

Rules:
- positive_points: 2-3 items. What is fortunate or meaningful about this dream.
- issues: 1-3 items if warnings exist; use [] if fully auspicious.
- symbols: 2-4 max. Every symbol MUST have non-empty vedic_meaning AND psychological_meaning.
- remedies: 2-3 practical Vedic actions (mantra, colour, food, ritual).
- lucky_numbers: exactly 3 integers.
- Never output empty strings. If unsure write a brief general meaning.`,
      messages: [
        {
          role: 'user',
          content: `Interpret this dream using Swapna Shastra: "${dream.trim()}"${chartContext}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const rawText = textBlock?.text ?? '{}';

    let parsed: {
      symbols: Array<{ symbol: string; vedic_meaning: string; psychological_meaning: string }>;
      overall_interpretation: string;
      astrological_connection: string;
      auspiciousness: 'auspicious' | 'inauspicious' | 'neutral';
      positive_points: string[];
      issues: string[];
      remedies: string[];
      lucky_numbers: number[];
    };
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const cleaned = jsonMatch ? jsonMatch[0] : rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed.symbols)) parsed.symbols = [];
      if (!Array.isArray(parsed.remedies)) parsed.remedies = [];
      if (!Array.isArray(parsed.lucky_numbers)) parsed.lucky_numbers = [];
      if (!Array.isArray(parsed.positive_points)) parsed.positive_points = [];
      if (!Array.isArray(parsed.issues)) parsed.issues = [];
      if (!['auspicious','inauspicious','neutral'].includes(parsed.auspiciousness)) parsed.auspiciousness = 'neutral';
      // Strip empty strings from symbol meanings
      parsed.symbols = parsed.symbols.map((s) => ({
        ...s,
        vedic_meaning: s.vedic_meaning || 'A significant Vedic symbol carrying cosmic energy.',
        psychological_meaning: s.psychological_meaning || 'Represents an aspect of the subconscious mind.',
      }));
    } catch {
      parsed = {
        symbols: [],
        overall_interpretation: rawText.replace(/```[\s\S]*?```/g, '').replace(/[{}[\]"]/g, '').trim().slice(0, 500),
        astrological_connection: '',
        auspiciousness: 'neutral',
        positive_points: [],
        issues: [],
        remedies: [],
        lucky_numbers: [],
      };
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: parsed,
    });
  } catch (error) {
    if (creditCharged) {
      await refundCredits(supabase, user.id, 1, 'Refund: Dream interpretation (AI error)');
    }
    console.error('Dream interpretation error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to interpret dream',
      },
      { status: 500 },
    );
  }
}
