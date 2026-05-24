import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { enqueueLifeJourneyPhases } from '@/lib/queue';
import { kickDrain } from '@/lib/queue/kick';
import { enqueueLiteJob } from '@/lib/insights/enqueue';
import { notifyBackendError } from '@/lib/telegram';

export const runtime = 'nodejs';

/**
 * POST /api/queue/enqueue-onboarding
 * Body: { chartId }
 * Called once after onboarding finishes. Reads the chart's dasha_data,
 * counts past+current phases, and enqueues a life_journey_phase job for each.
 * Then fires a non-blocking kick at /api/queue/drain so jobs start
 * immediately instead of waiting up to a minute for the cron tick.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { chartId } = await request.json() as { chartId: string };
    if (!chartId) return NextResponse.json({ error: 'chartId required' }, { status: 400 });

    const { data: chart } = await supabase
      .from('kundli_charts')
      .select('dasha_data')
      .eq('id', chartId)
      .eq('user_id', user.id)
      .single();
    if (!chart) return NextResponse.json({ error: 'Chart not found' }, { status: 404 });

    const dasha = chart.dasha_data as Record<string, unknown> | undefined;
    const vimshottari = dasha?.vimshottari as Record<string, unknown> | undefined;
    const mahadashas = (vimshottari?.mahadashas ?? []) as Array<Record<string, unknown>>;
    const now = new Date();
    // Only past + current phases — future phases haven't been lived yet
    const visiblePhases = mahadashas.filter(m => new Date(m.startDate as string) <= now).length;

    const enqueued = await enqueueLifeJourneyPhases(supabase, user.id, chartId, visiblePhases);

    // Enqueue past life generation in the user's chosen language
    const { data: userRow } = await supabase
      .from('users')
      .select('language')
      .eq('id', user.id)
      .single();
    void enqueueLiteJob(supabase, {
      chartId,
      userId: user.id,
      featureKey: 'past_life_lite',
      language: userRow?.language ?? 'en',
    });

    // Guna Chakra personality reading — auto-generates so it's ready when the user opens the page
    void enqueueLiteJob(supabase, {
      chartId,
      userId: user.id,
      featureKey: 'guna_chakra',
      language: userRow?.language ?? 'en',
    });

    // Name Correction — runs at low priority so it picks up after the other lite jobs
    // (past_life_lite, guna_chakra, life_journey phases) have drained. The page reads
    // this row from feature_insights; generation happens once and never again.
    void enqueueLiteJob(supabase, {
      chartId,
      userId: user.id,
      featureKey: 'name_correction',
      language: userRow?.language ?? 'en',
      priority: -5,
    });

    // Mobile Numerology — same low-priority tail. Skipped silently in the handler
    // if users.phone is null; the page then renders an "add a phone number" CTA.
    void enqueueLiteJob(supabase, {
      chartId,
      userId: user.id,
      featureKey: 'mobile_numerology',
      language: userRow?.language ?? 'en',
      priority: -5,
    });

    void kickDrain(request);

    return NextResponse.json({ success: true, enqueued });
  } catch (err) {
    console.error('[queue/enqueue-onboarding]', err);
    notifyBackendError('/api/queue/enqueue-onboarding', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
