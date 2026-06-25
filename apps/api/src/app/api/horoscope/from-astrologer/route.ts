export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import {
  generateFromAstrologerDaily,
  type FromAstrologerReading,
} from '@/lib/astrologer/fromAstrologerGenerate';

const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=3600' };

function tomorrowISO(): string {
  const ist = new Date(Date.now() + 5.5 * 3600000);
  ist.setUTCDate(ist.getUTCDate() + 1);
  return ist.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chartIdParam = searchParams.get('chartId');
    const language = searchParams.get('language') || 'en';
    const tomorrow = tomorrowISO();

    // Resolve chartId — param or primary chart.
    let chartId = chartIdParam;
    if (!chartId) {
      const { data: primaryChart } = await supabase
        .from('kundli_charts')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!primaryChart) {
        return NextResponse.json({ success: false, gated: true, reason: 'no_chart' });
      }
      chartId = primaryChart.id;
    }
    const resolvedChartId = chartId as string;

    // Reveal gate — the "astrologer reviewing for 2h" banner pretends manual review.
    // Until apollo_reveal_at passes, we hold back the card.
    const { data: userRow } = await supabase
      .from('users')
      .select('apollo_reveal_at, apollo_derived_at')
      .eq('id', user.id)
      .maybeSingle();

    const revealAt = userRow?.apollo_reveal_at ? new Date(userRow.apollo_reveal_at as string) : null;
    if (revealAt && revealAt > new Date()) {
      return NextResponse.json(
        { success: true, status: 'pending', revealAt: revealAt.toISOString() },
        { headers: CACHE_HEADERS },
      );
    }

    // feature_insights DB check (no Redis layer for this feature — daily card,
    // SWR header carries us between requests).
    const { data: insight } = await supabase
      .from('feature_insights')
      .select('content, expires_at')
      .eq('user_id', user.id)
      .eq('chart_id', resolvedChartId)
      .eq('feature_key', 'from_astrologer_daily')
      .eq('params_hash', tomorrow)
      .eq('language', language)
      .maybeSingle();

    if (insight?.expires_at && new Date(insight.expires_at) > new Date()) {
      return NextResponse.json(
        { success: true, status: 'ready', data: insight.content as FromAstrologerReading },
        { headers: CACHE_HEADERS },
      );
    }

    // Cache miss — generate now using the admin client (bypasses RLS for the
    // user-context joins, mirrors personalDaily route).
    const adminSupabase = createAdminSupabase();
    const reading = await generateFromAstrologerDaily(adminSupabase, {
      userId: user.id,
      chartId: resolvedChartId,
      language,
    });

    if (!reading) {
      return NextResponse.json(
        { success: false, error: 'Generation failed — try again in a moment' },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { success: true, status: 'ready', data: reading },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    console.error('[from-astrologer]', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate from-astrologer card' },
      { status: 500 },
    );
  }
}
