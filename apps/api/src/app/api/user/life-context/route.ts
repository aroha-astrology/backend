import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { cacheDel } from '@/lib/redis';
import { todayIST } from '@/lib/horoscope/generate';
import { enqueueLiteJob, kickQueueDrain } from '@/lib/insights/enqueue';
import type { ApiResponse } from '@aroha-astrology/shared';

const VALID_MARITAL = ['single', 'dating', 'engaged', 'married', 'separated_divorced', 'widowed'];
const VALID_FINANCIAL = ['tight', 'stable', 'comfortable', 'prefer_not_to_say'];

// Lite features whose tone shifts when the seeker tells us about their work,
// relationship, or money. Past, current, and forward-looking — all regenerated
// so the next visit reflects the new context.
const LIFE_CONTEXT_SENSITIVE_FEATURES = [
  'past_life_lite',     // past
  'summary_lite',       // current
  'personality_lite',   // current
  'career_lite',        // current
  'marriage_lite',      // current
  'couple_lite',        // current
  'health_lite',        // current
  'spiritual_lite',     // current
  'remedies_lite',      // current
  'dasha_widget',       // current/future
  'life_journey',       // current/future
  'yearly_lite',        // future
];

// Eagerly re-warm these on update — the rest can lazy-regen on next page visit.
const EAGER_REGEN_FEATURES = ['past_life_lite', 'summary_lite', 'dasha_widget', 'yearly_lite'];

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.profession === 'string') {
      updates.profession = body.profession.trim().slice(0, 200) || null;
    }
    if (typeof body.marital_status === 'string') {
      if (!VALID_MARITAL.includes(body.marital_status)) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `Invalid marital_status. Must be one of: ${VALID_MARITAL.join(', ')}` },
          { status: 400 },
        );
      }
      updates.marital_status = body.marital_status;
    }
    if (typeof body.financial_status === 'string') {
      if (!VALID_FINANCIAL.includes(body.financial_status)) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `Invalid financial_status. Must be one of: ${VALID_FINANCIAL.join(', ')}` },
          { status: 400 },
        );
      }
      updates.financial_status = body.financial_status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'No valid fields provided' },
        { status: 400 },
      );
    }

    updates.life_context_updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id)
      .select('profession, marital_status, financial_status, life_context_updated_at, language')
      .single();

    if (error) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to update: ${error.message}` },
        { status: 500 },
      );
    }

    // Invalidate caches so next reads regenerate with the new life context.
    // Three layers:
    //   1. personal_daily Redis fast-path
    //   2. personal_daily feature_insights row (today only — would re-warm Redis with stale data)
    //   3. all life-context-sensitive lite insights (past + current + future) so
    //      the past-life page, summary, career, dasha widget, etc. regenerate
    //      with the new context next time the user visits.
    const { data: charts } = await supabase
      .from('kundli_charts')
      .select('id')
      .eq('user_id', user.id);

    const language = ((data as Record<string, unknown> | null)?.language as string | undefined) ?? 'en';

    if (charts?.length) {
      const today = todayIST();
      const chartIds = charts.map(c => c.id);

      await Promise.all([
        ...chartIds.flatMap(id => [
          cacheDel(`personal_daily:${id}:${today}:en`),
          cacheDel(`personal_daily:${id}:${today}:hi`),
        ]),
        // Today's personal_daily row
        supabase
          .from('feature_insights')
          .delete()
          .eq('user_id', user.id)
          .eq('feature_key', 'personal_daily')
          .eq('params_hash', today)
          .in('chart_id', chartIds),
        // All life-context-sensitive lite insights — past + current + future
        supabase
          .from('feature_insights')
          .delete()
          .eq('user_id', user.id)
          .in('feature_key', LIFE_CONTEXT_SENSITIVE_FEATURES)
          .in('chart_id', chartIds),
      ]);

      // Eagerly re-warm the highest-impact features so users don't stare at a
      // loading state when they navigate away from settings.
      const enqueueResults = await Promise.all(
        chartIds.flatMap(chartId =>
          EAGER_REGEN_FEATURES.map(featureKey =>
            enqueueLiteJob(supabase, {
              chartId,
              userId: user.id,
              featureKey,
              language,
            }),
          ),
        ),
      );
      if (enqueueResults.some(Boolean)) kickQueueDrain();
    }

    return NextResponse.json<ApiResponse>({ success: true, data });
  } catch (error) {
    console.error('[life-context PATCH]', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Failed to update life context' },
      { status: 500 },
    );
  }
}
