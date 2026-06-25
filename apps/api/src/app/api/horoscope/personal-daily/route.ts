export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { cacheGet, cacheSet } from '@/lib/redis';
import { todayIST } from '@/lib/horoscope/generate';
import { generatePersonalDaily, type PersonalDailyReading } from '@/lib/horoscope/personalDailyGenerate';

const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=3600' };

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
    const today = todayIST();

    // Resolve chartId — use param or fall back to primary chart
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

    // REPORTS_DISABLED: gate removed — generate from birth chart + dasha directly,
    // no premium report required.

    // Redis fast path
    const redisKey = `personal_daily:${resolvedChartId}:${today}:${language}`;
    const cached = await cacheGet<PersonalDailyReading>(redisKey);
    if (cached) {
      return NextResponse.json({ success: true, data: cached }, { headers: CACHE_HEADERS });
    }

    // feature_insights DB check
    const { data: insight } = await supabase
      .from('feature_insights')
      .select('content, expires_at')
      .eq('user_id', user.id)
      .eq('chart_id', resolvedChartId)
      .eq('feature_key', 'personal_daily')
      .eq('params_hash', today)
      .eq('language', language)
      .maybeSingle();

    if (insight?.expires_at && new Date(insight.expires_at) > new Date()) {
      void cacheSet(redisKey, insight.content as PersonalDailyReading, 3600);
      return NextResponse.json({ success: true, data: insight.content }, { headers: CACHE_HEADERS });
    }

    // Fetch life-context from users table to personalise reading
    const { data: userRow } = await supabase
      .from('users')
      .select('profession, marital_status, financial_status, current_city')
      .eq('id', user.id)
      .single();

    // Cache miss — generate now from birth chart + dasha (no report needed)
    const adminSupabase = createAdminSupabase();
    const reading = await generatePersonalDaily(adminSupabase, {
      userId: user.id,
      chartId: resolvedChartId,
      language,
      profession: userRow?.profession ?? null,
      maritalStatus: userRow?.marital_status ?? null,
      financialStatus: userRow?.financial_status ?? null,
      currentCity: userRow?.current_city ?? null,
    });

    if (!reading) {
      return NextResponse.json(
        { success: false, error: 'Reading generation failed — try again in a moment' },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: true, data: reading }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error('[personal-daily]', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate personal daily reading' },
      { status: 500 },
    );
  }
}
