import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

// GET /api/admin/user-time-spent?user_id=...
// Returns time spent stats for a single user: today / last 7d / last 30d / lifetime.
//
// Calculation: group activity events by session_id, take MAX-MIN per session,
// cap each session at 30 minutes (idle-tab guard), then bucket by session start.
// This matches the convention picked when designing this feature.
const SESSION_CAP_MS = 30 * 60 * 1000;

interface MinimalEvent { session_id: string | null; created_at: string }

export async function GET(req: NextRequest) {
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

  const targetUserId = req.nextUrl.searchParams.get('user_id');
  if (!targetUserId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Page through to ensure we cover lifetime even for power users.
  const events: MinimalEvent[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('user_activity_log')
      .select('session_id, created_at')
      .eq('user_id', targetUserId)
      .not('session_id', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    events.push(...data);
    if (data.length < PAGE) break;
    if (offset > 50_000) break; // safety bound
  }

  // Bucket events by session_id, collapse to {start, durationMs}.
  const sessionMap = new Map<string, { start: number; end: number }>();
  for (const ev of events) {
    if (!ev.session_id) continue;
    const t = new Date(ev.created_at).getTime();
    const existing = sessionMap.get(ev.session_id);
    if (!existing) {
      sessionMap.set(ev.session_id, { start: t, end: t });
    } else {
      if (t < existing.start) existing.start = t;
      if (t > existing.end) existing.end = t;
    }
  }

  const now = Date.now();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const sevenDaysMs = now - 7 * 86400_000;
  const thirtyDaysMs = now - 30 * 86400_000;

  let todaySec = 0, last7dSec = 0, last30dSec = 0, lifetimeSec = 0;
  for (const { start, end } of sessionMap.values()) {
    const durMs = Math.min(end - start, SESSION_CAP_MS);
    const sec = Math.round(durMs / 1000);
    lifetimeSec += sec;
    if (start >= thirtyDaysMs) last30dSec += sec;
    if (start >= sevenDaysMs)  last7dSec  += sec;
    if (start >= todayMs)      todaySec   += sec;
  }

  // Last login + last activity for the banner line.
  const { data: authUser } = await admin.auth.admin.getUserById(targetUserId);
  const lastSignInAt = authUser?.user?.last_sign_in_at ?? null;

  const { data: presenceRow } = await admin
    .from('user_presence')
    .select('last_ping_at')
    .eq('user_id', targetUserId)
    .maybeSingle();

  return NextResponse.json({
    data: {
      today_seconds:     todaySec,
      last_7d_seconds:   last7dSec,
      last_30d_seconds:  last30dSec,
      lifetime_seconds:  lifetimeSec,
      session_count:     sessionMap.size,
      last_sign_in_at:   lastSignInAt,
      last_ping_at:      presenceRow?.last_ping_at ?? null,
    },
  });
}
