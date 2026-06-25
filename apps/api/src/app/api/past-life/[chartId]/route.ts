import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { enqueueLiteJob, kickQueueDrain } from '@/lib/insights/enqueue';
import type { ApiResponse } from '@aroha-astrology/shared';

export const maxDuration = 30;

interface PastLifeContent {
  // New story-shaped schema (lite_ai)
  who_you_were?: string;
  what_you_mastered?: string;
  what_you_left_unfinished?: string;
  how_it_shows_up_now?: string;
  keep_with_you?: string;
  why_we_see_this?: string;
  // Legacy report-enriched shape — surfaced if the row was filled from a full report
  past_life?: string;
  moksha_indicators?: string;
}

/**
 * GET /api/past-life/[chartId]?language=en
 *
 * Returns the cached past_life_lite insight if available; otherwise lazy-enqueues
 * generation (mirrors the guna-chakra pattern). The page renders both the new
 * narrative shape (who_you_were etc.) and the legacy enriched-from-report shape
 * (past_life + moksha_indicators).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chartId: string }> },
) {
  try {
    const supabase = await createServerSupabase();
    const { chartId } = await params;
    const language = request.nextUrl.searchParams.get('language') ?? 'en';

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!chartId) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Chart ID is required' }, { status: 400 });
    }

    // Confirm chart belongs to this user (RLS would catch it, but explicit beats implicit here)
    const { data: chart } = await supabase
      .from('kundli_charts')
      .select('id, birth_profiles(name)')
      .eq('id', chartId)
      .eq('user_id', user.id)
      .single();

    if (!chart) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Chart not found' }, { status: 404 });
    }

    const profile = Array.isArray(chart.birth_profiles) ? chart.birth_profiles[0] : chart.birth_profiles;
    const profileName = (profile as { name?: string | null } | null)?.name ?? null;

    const { data: cached } = await supabase
      .from('feature_insights')
      .select('source, content, expires_at, generated_at')
      .eq('user_id', user.id)
      .eq('chart_id', chartId)
      .eq('feature_key', 'past_life_lite')
      .eq('params_hash', '')
      .eq('language', language)
      .maybeSingle();

    const now = new Date().toISOString();
    const fresh = cached && (cached.expires_at === null || cached.expires_at > now);
    const content = (fresh ? (cached.content as PastLifeContent) : null) ?? null;
    const source = fresh ? cached.source as string : null;

    // Lazy-enqueue if no fresh AI reading yet
    let generating = false;
    const hasAiReading = source === 'lite_ai' || source === 'report_enriched';
    if (!hasAiReading) {
      const enqueued = await enqueueLiteJob(supabase, {
        chartId,
        userId: user.id,
        featureKey: 'past_life_lite',
        language,
      });
      if (enqueued) {
        kickQueueDrain();
        generating = true;
      }
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        content,
        source,
        profileName,
        generating,
      },
    });
  } catch (error) {
    console.error('Past Life GET error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load past life reading' },
      { status: 500 },
    );
  }
}
