export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * GET /api/credits/balance
 * Returns the authenticated user's current credit balance.
 * Uses the server (cookie-based) client — the user's own session satisfies
 * the users_select_own RLS policy, so no service-role key is required.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { credits: (data?.credits as number | null | undefined) ?? 0 },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to fetch balance' },
      { status: 500 },
    );
  }
}
