import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

// POST /api/presence/ping
// Called every ~60s by the browser while a tab is visible. Upserts a single
// row keyed by user_id so admin can show a live online indicator.
export async function POST() {
  try {
    const userSupabase = await createServerSupabase();
    const { data: { user } } = await userSupabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const admin = createAdminSupabase();
    await admin
      .from('user_presence')
      .upsert(
        { user_id: user.id, last_ping_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
