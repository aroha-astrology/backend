import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/init
 * Single-auth bootstrap for the dashboard — one auth.getUser() call, five DB queries
 * run in parallel. Replaces individual calls to /api/user/settings, /api/profiles,
 * /api/kundli, /api/credits/balance, and /api/notifications on page load.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const uid = user.id;

    const [userRow, profiles, charts, notifications] = await Promise.all([
      supabase
        .from('users')
        .select('id, email, name, phone, credits, theme, language, chart_style, is_premium, premium_until, created_at, profession, marital_status, financial_status, life_context_updated_at, legal_accepted_at, legal_version, voice_call_enabled')
        .eq('id', uid)
        .single()
        .then(r => r.data ?? null),

      supabase
        .from('birth_profiles')
        .select('id, name, dob, tob, tob_source, pob, latitude, longitude, timezone, gender, is_primary, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .then(r => r.data ?? []),

      supabase
        .from('kundli_charts')
        .select('id, profile_id, user_id, ayanamsa, chart_data, divisional_charts, dasha_data, yoga_data, dosha_data, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(r => r.data ?? []),

      supabase
        .from('notifications')
        .select('id, type, title, body, link, metadata, read_at, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(30)
        .then(r => r.data ?? []),
    ]);

    const unreadCount = notifications.filter((n: { read_at: string | null }) => !n.read_at).length;

    const response = NextResponse.json({
      success: true,
      data: {
        user: userRow,
        credits: userRow?.credits ?? 0,
        profiles,
        charts,
        notifications,
        unreadCount,
      },
    });

    // Allow browser to use a fresh response for 30 s, serve stale up to 2 min while revalidating
    response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
    return response;
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Init failed' },
      { status: 500 },
    );
  }
}
