export const runtime = 'nodejs';

import { NextResponse, after } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { deductCredits } from '@/lib/credits/deductCredits';

// Step 1: Save a pending record and fire background processor (same pattern as numerology)
export const maxDuration = 300; // 10 minutes

const REPORT_TOKEN_COSTS: Record<string, number> = {
  basic: 1,
  standard: 2,
  premium: 3,
};

// REPORTS_DISABLED: Report generation is temporarily disabled.
// Remove the early return below to re-enable.
export async function POST(_request: Request) {
  return NextResponse.json(
    { success: false, error: 'Report generation is temporarily disabled. The app is running in chart-only mode.' },
    { status: 503 },
  );
}

/* REPORTS_DISABLED_START — original POST handler below
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { chartId, profileId, profile_id, tier, language: bodyLanguage } = await request.json();
    const resolvedProfileId = profileId ?? profile_id ?? null;
    const resolvedChartId = chartId ?? null;
    // Prefer explicit body field, else fall back to UI cookie set by TranslationProvider
    const cookieLang = request.headers.get('cookie')?.match(/(?:^|;\s*)i18n-lang=([^;]+)/)?.[1];
    const reportLanguage = (typeof bodyLanguage === 'string' && bodyLanguage)
      ? bodyLanguage
      : (cookieLang ? decodeURIComponent(cookieLang) : 'en');

    // Grab profile pic from OAuth metadata (Google picture, GitHub avatar, etc.)
    const avatarUrl =
      (user.user_metadata?.avatar_url as string | undefined) ||
      (user.user_metadata?.picture as string | undefined) ||
      null;

    if (!tier) return NextResponse.json({ success: false, error: 'Tier is required' }, { status: 400 });
    if (!resolvedChartId && !resolvedProfileId) return NextResponse.json({ success: false, error: 'chartId or profileId is required' }, { status: 400 });

    // Deduct tokens based on report tier
    const tokenCost = REPORT_TOKEN_COSTS[tier] ?? 1;
    const tierLabel = tier === 'basic' ? 'Basic' : tier === 'standard' ? 'Standard' : 'Premium';
    const creditResult = await deductCredits(
      supabase, user.id, tokenCost, 'report_debit',
      `${tierLabel} Kundli Report generation (${tokenCost} token${tokenCost !== 1 ? 's' : ''})`,
    );
    if (!creditResult.success) {
      return NextResponse.json(
        { success: false, error: creditResult.error ?? 'Insufficient tokens', code: 'INSUFFICIENT_TOKENS' },
        { status: 402 },
      );
    }

    // Fetch chart + profile
    let chartQuery = supabase.from('kundli_charts').select('*, birth_profiles(*)').eq('user_id', user.id);
    if (resolvedChartId) chartQuery = chartQuery.eq('id', resolvedChartId);
    else chartQuery = chartQuery.eq('profile_id', resolvedProfileId).order('created_at', { ascending: false }).limit(1);
    const { data: chart } = await chartQuery.single();
    if (!chart) return NextResponse.json({ success: false, error: 'No Kundli chart found for this profile. Please generate a Kundli first at /kundli/generate, then come back to generate the report.' }, { status: 404 });

    const profileData = (chart as Record<string, unknown>).birth_profiles as Record<string, unknown> | undefined;
    const name = String(profileData?.name ?? 'Native');
    const dob = String(profileData?.dob ?? '');

    // Dedup: if this user already has a report of the same tier for the same
    // person (matched by name + dob), return that report instead of regenerating.
    const { data: existingReport } = await supabase
      .from('generated_reports')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('report_type', `kundli_${tier}`)
      .eq('subject_name', name)
      .eq('subject_dob', dob)
      .in('status', ['pending', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingReport) {
      return NextResponse.json({
        success: true,
        data: { report_id: existingReport.id, status: existingReport.status, reused: true },
      });
    }

    // Save pending report record
    const { data: savedReport, error: saveError } = await supabase
      .from('generated_reports')
      .insert({
        user_id: user.id,
        report_type: `kundli_${tier}`,
        subject_name: name,
        subject_dob: dob,
        subject_gender: profileData?.gender ?? 'male',
        status: 'pending',
        pdf_filename: `kundli-report-${name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        metadata: {
          tier,
          language: reportLanguage,
          avatarUrl,
          chartId: chart.id,
          profileId: resolvedProfileId,
          chartData: chart.chart_data,
          dashaData: chart.dasha_data,
          yogaData: chart.yoga_data,
          doshaData: chart.dosha_data,
          shadbala: chart.shadbala,
          ashtakavarga: chart.ashtakavarga,
          profileData,
        },
        ai_content: {},
      })
      .select('id')
      .single();

    if (saveError || !savedReport) {
      return NextResponse.json({ success: false, error: 'Failed to create report record' }, { status: 500 });
    }

    const reportId = savedReport.id as string;

    // Trigger processing: fire-and-forget so the report is processed immediately.
    // If Colab worker is also running, the atomic status claim in /process prevents double-processing.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const processKey = process.env.INTERNAL_PROCESS_KEY;
    if (!processKey) {
      console.error('[reports/generate] INTERNAL_PROCESS_KEY not set — report pending but not triggered');
      return NextResponse.json({ success: true, data: { report_id: reportId, status: 'pending' } });
    }
    after(async () => {
      try {
        const res = await fetch(`${appUrl}/api/reports/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-key': processKey,
          },
          body: JSON.stringify({ report_id: reportId, user_id: user.id }),
        });
        if (!res.ok) {
          console.error('[reports/generate] /process returned', res.status, await res.text());
        }
      } catch (err) {
        console.error('[reports/generate] Failed to trigger process:', err);
      }
    });

    return NextResponse.json({
      success: true,
      data: { report_id: reportId, status: 'pending' },
    });
  } catch (error) {
    console.error('Report generation start error:', error);
    return NextResponse.json({ success: false, error: 'Failed to start report generation' }, { status: 500 });
  }
}
REPORTS_DISABLED_END */
