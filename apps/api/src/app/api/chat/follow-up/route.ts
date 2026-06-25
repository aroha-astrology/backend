import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ApiResponse } from '@aroha-astrology/shared';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { chartId, question, answer } = await request.json() as {
      chartId?: string;
      question?: string;
      answer?: string;
    };

    if (!chartId || !question?.trim() || !answer?.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'chartId, question and answer required' },
        { status: 400 },
      );
    }

    const { data: chart } = await supabase
      .from('kundli_charts')
      .select('id')
      .eq('id', chartId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!chart) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Chart not found' }, { status: 404 });
    }

    const trimmedQ = question.trim().slice(0, 500);
    const trimmedA = answer.trim().slice(0, 500);

    const { data: existing } = await supabase
      .from('follow_up_questions')
      .select('id, answer')
      .eq('chart_id', chartId)
      .eq('question', trimmedQ)
      .maybeSingle();

    if (existing) {
      if (existing.answer !== trimmedA) {
        await supabase.from('follow_up_questions').update({ answer: trimmedA }).eq('id', existing.id);
      }
    } else {
      await supabase.from('follow_up_questions').insert({
        chart_id: chartId,
        question: trimmedQ,
        answer: trimmedA,
      });
    }

    return NextResponse.json<ApiResponse>({ success: true, data: { saved: true } });
  } catch (error) {
    console.error('[chat/follow-up] error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save answer' },
      { status: 500 },
    );
  }
}
