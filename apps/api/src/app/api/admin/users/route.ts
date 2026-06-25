import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

// "Online" = pinged in the last 90s (heartbeat fires every 60s).
const ONLINE_WINDOW_MS = 90_000;

// GET /api/admin/users
// Returns all users with report counts, last login, and live presence (admin only).
export async function GET() {
  const userSupabase = await createServerSupabase();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await userSupabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminSupabase();

  const { data: users, error } = await admin
    .from('users')
    .select('id, name, email, is_admin, is_premium, credits, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userIds = (users ?? []).map((u) => u.id);

  // Report counts
  const { data: reportCounts } = await admin
    .from('generated_reports')
    .select('user_id')
    .in('user_id', userIds);

  const reportMap = (reportCounts ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.user_id] = (acc[row.user_id] ?? 0) + 1;
    return acc;
  }, {});

  // Presence (last heartbeat ping per user)
  const { data: presenceRows } = await admin
    .from('user_presence')
    .select('user_id, last_ping_at')
    .in('user_id', userIds);

  const presenceMap = (presenceRows ?? []).reduce<Record<string, string>>((acc, row) => {
    acc[row.user_id] = row.last_ping_at;
    return acc;
  }, {});

  // Last sign-in from auth.users — paged because perPage caps at 1000.
  const lastSignInMap: Record<string, string> = {};
  for (let page = 1; page < 20; page++) {
    const { data, error: authErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (authErr || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.last_sign_in_at) lastSignInMap[u.id] = u.last_sign_in_at;
    }
    if (data.users.length < 1000) break;
  }

  const now = Date.now();
  const enriched = (users ?? []).map((u) => {
    const lastPing = presenceMap[u.id] ?? null;
    const isOnline = lastPing
      ? now - new Date(lastPing).getTime() < ONLINE_WINDOW_MS
      : false;
    return {
      ...u,
      report_count:     reportMap[u.id] ?? 0,
      last_sign_in_at:  lastSignInMap[u.id] ?? null,
      last_ping_at:     lastPing,
      is_online:        isOnline,
    };
  });

  return NextResponse.json({ data: enriched });
}
