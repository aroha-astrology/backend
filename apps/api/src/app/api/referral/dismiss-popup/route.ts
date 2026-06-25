import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ApiResponse } from '@aroha-astrology/shared';

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

    const { error: updateError } = await supabase
      .from('users')
      .update({ referral_popup_seen_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json<ApiResponse>({ success: true, data: { dismissed: true } });
  } catch (error) {
    console.error('Referral dismiss-popup error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to dismiss' },
      { status: 500 },
    );
  }
}
