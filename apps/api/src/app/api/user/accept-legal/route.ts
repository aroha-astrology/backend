import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { LEGAL_VERSION } from '@/lib/legal';
import type { ApiResponse } from '@aroha-astrology/shared';

// POST /api/user/accept-legal
// Records that the authenticated user has accepted the current bundled legal
// documents (Terms + Privacy + Astrology Disclaimer). The server stamps both
// the timestamp and the version constant — the client cannot fabricate either.
export async function POST() {
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

    const { data, error } = await supabase
      .from('users')
      .update({
        legal_accepted_at: new Date().toISOString(),
        legal_version: LEGAL_VERSION,
      })
      .eq('id', user.id)
      .select(
        'id, email, name, phone, credits, theme, language, chart_style, is_premium, premium_until, created_at, profession, marital_status, financial_status, life_context_updated_at, legal_accepted_at, legal_version',
      )
      .single();

    if (error) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to record acceptance: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data,
      message: 'Legal acceptance recorded',
    });
  } catch (err) {
    console.error('accept-legal error:', err);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to record acceptance',
      },
      { status: 500 },
    );
  }
}
