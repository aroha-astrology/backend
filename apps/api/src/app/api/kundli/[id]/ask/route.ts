import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import type { ApiResponse } from '@aroha-astrology/shared';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabase();
    const { id: chartId } = await params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { question, sectionType, sectionContent } = body as {
      question: string;
      sectionType: string;
      sectionContent: string;
    };

    if (!question?.trim()) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Question is required' }, { status: 400 });
    }

    // Fetch profile for personalisation context
    const { data: chart } = await supabase
      .from('kundli_charts')
      .select('birth_profiles(name, dob, gender)')
      .eq('id', chartId)
      .eq('user_id', user.id)
      .single();

    const profile = (chart as { birth_profiles?: { name?: string; dob?: string; gender?: string } } | null)?.birth_profiles;
    const name = profile?.name ?? 'the seeker';
    const dob = profile?.dob ?? '';
    const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
    const ageCtx = age ? `Age: ${age}` : '';

    const systemPrompt = `You are answering a follow-up question about the seeker's Vedic birth chart.

SEEKER CONTEXT:
Name: ${name}
${ageCtx}
Chart section being discussed: ${sectionType}

PREDICTION TEXT THE SEEKER IS ASKING ABOUT:
"""
${(sectionContent ?? '').slice(0, 1200)}
"""

RULES:
- Answer ONLY based on the prediction text above and standard Vedic principles — do not invent specific planetary positions or dates not mentioned.
- Keep your answer to 2–4 short sentences or 2–3 bullet points. Do not write an essay.
- Use plain language. If you must use an astrological term, add a plain-English explanation in brackets on first use.
- Lead with what this means for the seeker's life (human impact), not the mechanism.
- Do not mention you are an AI. Respond as Yogi Baba — warm, wise, direct.
- Format: if the answer has multiple points, use • bullet lines. If it is one clear thought, write it as a single short paragraph.`;

    const response = await createAIMessage({
      system: systemPrompt,
      messages: [{ role: 'user', content: question.trim() }],
      max_tokens: 300,
      temperature: 0.65,
    });

    const answer = response.content?.[0]?.text?.trim() ?? 'I was unable to generate an answer. Please try again.';

    return NextResponse.json<ApiResponse>({ success: true, data: { answer } });
  } catch (error) {
    console.error('Ask astrologer error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get answer' },
      { status: 500 },
    );
  }
}
