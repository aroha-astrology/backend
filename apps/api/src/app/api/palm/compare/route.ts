import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { deductCredits } from '@/lib/credits/deductCredits';
import type { ApiResponse } from '@aroha-astrology/shared';
import { comparePalms } from '@/lib/palm/analysis';
import { fetchKundliContext } from '@/lib/palm/kundliContext';

export const maxDuration = 120;

/* -------------------------------------------------------------------------- */
/*  POST /api/palm/compare                                                    */
/*                                                                            */
/*  Takes two existing palm-reading ids (one per hand, same user) and returns */
/*  the karmic-shift delta — the Samudrika Shastra "both hands" method.       */
/* -------------------------------------------------------------------------- */

const Schema = z.object({
  leftReadingId: z.string().uuid(),
  rightReadingId: z.string().uuid(),
  chartId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Palm comparison');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }

    const parsed = Schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const { leftReadingId, rightReadingId, chartId } = parsed.data;

    const { data: rows, error } = await supabase
      .from('palm_readings')
      .select('id, hand, analysis')
      .in('id', [leftReadingId, rightReadingId])
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    const left = rows?.find((r) => r.id === leftReadingId && r.hand === 'left');
    const right = rows?.find((r) => r.id === rightReadingId && r.hand === 'right');
    if (!left || !right) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Both a left-hand and a right-hand reading are required.' },
        { status: 400 },
      );
    }

    let kundli;
    try { kundli = await fetchKundliContext(supabase, user.id, chartId); } catch { /* ignore */ }

    const comparison = await comparePalms(
      left.analysis as Record<string, unknown>,
      right.analysis as Record<string, unknown>,
      kundli,
    );

    return NextResponse.json<ApiResponse>({ success: true, data: { comparison } });
  } catch (err) {
    console.error('[palm/compare] error:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : 'Compare failed' },
      { status: 500 },
    );
  }
}
