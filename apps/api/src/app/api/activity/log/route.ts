import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

// POST /api/activity/log
// Accepts a client-side event and writes it to user_activity_log.
// Uses the caller's session to determine user_id — clients cannot spoof it.
export async function POST(req: NextRequest) {
  try {
    const userSupabase = await createServerSupabase();
    const { data: { user } } = await userSupabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = await req.json();
    const { session_id, event_type, page, action, label, metadata } = body;

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      null;
    const user_agent = req.headers.get('user-agent') ?? null;

    const admin = createAdminSupabase();
    await admin.from('user_activity_log').insert({
      user_id: user.id,
      session_id: session_id ?? null,
      event_type: event_type ?? 'unknown',
      page: page ?? null,
      action: action ?? null,
      label: label ?? null,
      metadata: typeof metadata === 'object' && metadata !== null ? metadata : {},
      ip,
      user_agent,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Never let activity logging break the caller
    return NextResponse.json({ ok: false });
  }
}
