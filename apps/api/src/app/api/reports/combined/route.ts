import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ApiResponse } from '@aroha-astrology/shared';
import {
  generateCombinedReport,
  summarisePalm,
  summariseChart,
  type ChartSummary,
} from '@/lib/palm/combinedReport';
import { fetchKundliContext } from '@/lib/palm/kundliContext';

export const maxDuration = 180;

/* -------------------------------------------------------------------------- */
/*  POST /api/reports/combined                                                */
/*                                                                            */
/*  Body: { palmReadingId, chartId? }                                         */
/*                                                                            */
/*  Reconciles a palm reading with a birth chart into one coherent report.    */
/*  If chartId is omitted we fall back to the user's most recent chart;       */
/*  if no chart exists we return 412 with a hint to add birth details.        */
/* -------------------------------------------------------------------------- */

const Schema = z.object({
  palmReadingId: z.string().uuid(),
  chartId: z.string().uuid().optional(),
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = Schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const { palmReadingId, chartId, force } = parsed.data;

    // ---- Palm reading -----------------------------------------------------
    const { data: palmReading, error: palmErr } = await supabase
      .from('palm_readings')
      .select('id, hand, analysis')
      .eq('id', palmReadingId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (palmErr || !palmReading) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Palm reading not found.' },
        { status: 404 },
      );
    }

    // ---- Chart (optional but strongly preferred) --------------------------
    const chartQuery = supabase
      .from('kundli_charts')
      .select('id, chart_data, dasha_data, yogas, doshas, birth_profiles(name)')
      .eq('user_id', user.id);

    const chartRes = chartId
      ? await chartQuery.eq('id', chartId).maybeSingle()
      : await chartQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (!chartRes.data) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'No birth chart found. Add your birth details to unlock the combined report.',
        },
        { status: 412 },
      );
    }
    const chart = chartRes.data;

    // ---- Cache: if we already have a combined report for this pair ------
    if (!force) {
      const { data: existing } = await supabase
        .from('generated_reports')
        .select('id, ai_content')
        .eq('user_id', user.id)
        .eq('report_type', 'combined_palm_kundli')
        .eq('palm_reading_id', palmReadingId)
        .eq('chart_id', chart.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.ai_content) {
        return NextResponse.json<ApiResponse>({
          success: true,
          data: { reportId: existing.id, report: existing.ai_content, cached: true },
        });
      }
    }

    // ---- Build summaries --------------------------------------------------
    const ctx = await fetchKundliContext(supabase, user.id, chart.id);

    const dashaData = (chart.dasha_data ?? {}) as Record<string, unknown>;
    const vimshottari = dashaData.vimshottari as Record<string, unknown> | undefined;
    const currentAntardasha =
      (vimshottari?.currentAntardasha as { planet?: string } | undefined)?.planet;

    const cd = (chart.chart_data ?? {}) as Record<string, unknown>;
    const ascendantLord =
      (cd.ascendantLord as string | undefined) ??
      ((cd.ascendant as { lord?: string } | undefined)?.lord);

    const yogas = Array.isArray(chart.yogas)
      ? (chart.yogas as Array<{ name?: string }>).map((y) => y.name).filter(Boolean) as string[]
      : undefined;
    const doshas = Array.isArray(chart.doshas)
      ? (chart.doshas as Array<{ name?: string }>).map((d) => d.name).filter(Boolean) as string[]
      : undefined;

    const palmSummary = summarisePalm(palmReading.analysis as Record<string, unknown>);
    const chartSummary: ChartSummary = summariseChart(
      ctx ?? {},
      yogas,
      doshas,
      ascendantLord,
      currentAntardasha,
    );

    const subjectName = (chart.birth_profiles as { name?: string } | null | undefined)?.name;

    // ---- AI call ----------------------------------------------------------
    const report = await generateCombinedReport(palmSummary, chartSummary, subjectName);

    // ---- Persist ----------------------------------------------------------
    const { data: saved, error: saveErr } = await supabase
      .from('generated_reports')
      .insert({
        user_id: user.id,
        report_type: 'combined_palm_kundli',
        subject_name: subjectName ?? 'Self',
        ai_content: report,
        palm_reading_id: palmReadingId,
        chart_id: chart.id,
        metadata: {
          palmHand: palmReading.hand,
          ascendant: chartSummary.ascendant,
          mahadasha: chartSummary.currentMahadasha,
        },
      })
      .select('id')
      .single();

    if (saveErr) {
      // Don't fail the whole request — return the AI content even if persistence failed.
      console.warn('[reports/combined] persist failed:', saveErr);
      return NextResponse.json<ApiResponse>({
        success: true,
        data: { reportId: null, report, cached: false, persistWarning: saveErr.message },
      });
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { reportId: saved.id, report, cached: false },
    });
  } catch (err) {
    console.error('[reports/combined] error:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : 'Combined report failed' },
      { status: 500 },
    );
  }
}
