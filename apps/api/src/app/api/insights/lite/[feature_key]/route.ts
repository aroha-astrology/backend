// GET /api/insights/lite/[feature_key]
//
// Returns the latest feature_insights row for the authenticated user.
// Lives under /lite/ to avoid colliding with /api/insights/[featureKey] —
// Next.js rejects same-position slug-name conflicts at runtime, taking down
// every serverless function on the deployment.
// Used by the Name Correction and Mobile Numerology pages. Onboarding enqueues
// the lite jobs at signup; this route is the safety net for pre-existing users
// who predate that flow — on first read with no row, it lazily enqueues a
// feature_lite job (idempotent via the queue dedupe index) and kicks the drain
// so the next 3s poll picks up the result. Always returns 200 —
// { status: 'pending' } when no row exists yet, so the client can poll without
// juggling 4xx.
//
// Allow-list is deliberately narrow: only the two features that ride this
// shared endpoint today. Broaden when new pages need it.

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { enqueueLiteJob } from '@/lib/insights/enqueue';
import { kickDrain } from '@/lib/queue/kick';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_KEYS = new Set(['name_correction', 'mobile_numerology']);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ feature_key: string }> },
) {
  const { feature_key } = await params;

  if (!ALLOWED_KEYS.has(feature_key)) {
    return NextResponse.json({ error: 'unknown feature' }, { status: 404 });
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Most users have one chart, so we just take the most recent insight for
  // this feature_key. If they have multiple charts, "latest" still gives the
  // right thing because each new chart re-enqueues.
  const { data, error } = await supabase
    .from('feature_insights')
    .select('feature_key, content, source, generated_at, expires_at')
    .eq('user_id', user.id)
    .eq('feature_key', feature_key)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[insights] select failed', error);
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  }

  const isExpired = data?.source === 'deterministic'
    && data.expires_at
    && data.expires_at < new Date().toISOString();

  if (!data || isExpired) {
    // Backfill path for users who predate the onboarding enqueue, or whose
    // deterministic fallback expired. Look up their most recent chart and
    // enqueue a feature_lite job; the dedupe index drops duplicates silently
    // so polling every 3 s won't pile up jobs. All best-effort — never let an
    // enqueue failure block the pending response.
    void ensureLiteJobEnqueued(supabase, req, user.id, feature_key);
    return NextResponse.json({ status: 'pending' });
  }

  return NextResponse.json({
    status: 'ready',
    insight: {
      feature_key: data.feature_key,
      content: data.content,
      source: data.source,
      generated_at: data.generated_at,
    },
  });
}

async function ensureLiteJobEnqueued(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  req: Request,
  userId: string,
  featureKey: string,
): Promise<void> {
  try {
    const { data: chart } = await supabase
      .from('kundli_charts')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!chart?.id) return; // no chart yet — nothing to base the reading on

    const { data: userRow } = await supabase
      .from('users')
      .select('language, phone')
      .eq('id', userId)
      .maybeSingle();

    // Mobile Numerology needs a phone number — the handler would skip and
    // never write a row, so polling would re-enqueue forever. Bail here.
    if (featureKey === 'mobile_numerology' && !userRow?.phone) return;

    const enqueued = await enqueueLiteJob(supabase, {
      chartId: chart.id as string,
      userId,
      featureKey,
      language: userRow?.language ?? 'en',
      priority: -5,
    });
    if (enqueued) void kickDrain(req);
  } catch (e) {
    console.warn('[insights/lite] lazy enqueue failed', e);
  }
}
