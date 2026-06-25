import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { fcm_token, platform } = body ?? {};

  if (!fcm_token || typeof fcm_token !== 'string') {
    return NextResponse.json({ success: false, error: 'fcm_token is required' }, { status: 400 });
  }
  if (platform !== 'android-fcm') {
    return NextResponse.json({ success: false, error: 'invalid platform' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Upsert on (user_id, fcm_token) — partial unique index from migration 029.
  // On conflict, touch last_used_at so we know the token is still alive.
  const { data, error } = await admin
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, fcm_token, platform, last_used_at: new Date().toISOString() },
      { onConflict: 'user_id,fcm_token', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (error) {
    console.error('[push-native] upsert failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to register token' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { id: data.id } });
}
