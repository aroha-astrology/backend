import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ApiResponse } from '@aroha-astrology/shared';

interface FollowUpAnswerPayload {
  questionId: string;
  answer: string | null;
  skipped: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabase();
    const { id: chartId } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const answers: FollowUpAnswerPayload[] = body.answers ?? [];

    if (!answers.length) {
      return NextResponse.json<ApiResponse>({ success: true, data: { updated: 0 } });
    }

    // Update each follow-up question with the user's answer
    let updated = 0;
    for (const ans of answers) {
      if (ans.skipped || ans.answer === null) continue;

      const { error } = await supabase
        .from('follow_up_questions')
        .update({ answer: ans.answer })
        .eq('id', ans.questionId)
        .eq('chart_id', chartId);

      if (!error) updated++;
    }

    return NextResponse.json<ApiResponse>({ success: true, data: { updated } });
  } catch (error) {
    console.error('Follow-up answer error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save answers' },
      { status: 500 },
    );
  }
}
