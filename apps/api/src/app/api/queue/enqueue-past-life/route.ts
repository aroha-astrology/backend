import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { enqueueLiteJob, kickQueueDrain } from '@/lib/insights/enqueue';

export const runtime = 'nodejs';

/**
 * POST /api/queue/enqueue-past-life
 * Body: { chartId }
 * Idempotent — skips if a non-expired past_life_lite insight already exists.
 * Called from AuthProvider on every login and from enqueue-onboarding after signup.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { chartId } = await request.json() as { chartId?: string };
    if (!chartId) return NextResponse.json({ error: 'chartId required' }, { status: 400 });

    // Read user's chosen language
    const { data: userRow } = await supabase
      .from('users')
      .select('language')
      .eq('id', user.id)
      .single();
    const language = userRow?.language ?? 'en';

    // Skip if a valid (non-expired) past_life_lite insight already exists
    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from('feature_insights')
      .select('id, expires_at')
      .eq('user_id', user.id)
      .eq('chart_id', chartId)
      .eq('feature_key', 'past_life_lite')
      .eq('language', language)
      .neq('source', 'deterministic')
      .maybeSingle();

    if (existing && (existing.expires_at === null || existing.expires_at > now)) {
      return NextResponse.json({ success: true, enqueued: false, reason: 'already_generated' });
    }

    const enqueued = await enqueueLiteJob(supabase, {
      chartId,
      userId: user.id,
      featureKey: 'past_life_lite',
      language,
    });

    if (enqueued) kickQueueDrain();

    return NextResponse.json({ success: true, enqueued });
  } catch (err) {
    console.error('[queue/enqueue-past-life]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
