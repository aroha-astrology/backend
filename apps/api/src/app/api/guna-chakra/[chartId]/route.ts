import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { calculateShadbala } from '@aroha-astrology/astro-engine';
import type { ApiResponse, ChartData, PlanetShadbala } from '@aroha-astrology/shared';
import { mapShadbalaToAxes } from '@/lib/guna/mapShadbalaToAxes';
import { runLite } from '@/lib/insights/runLite';

// Raised to 60s so inline NIM generation fits within the function budget.
export const maxDuration = 60;

interface GunaContent {
  summary?: string;
  strengths?: string;
  challenges?: string;
  do?: string;
  dont?: string;
}

async function loadChartShadbala(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  chartId: string,
): Promise<{ shadbala: PlanetShadbala[]; profileName: string | null } | { error: string; status: number }> {
  const { data: chart, error } = await supabase
    .from('kundli_charts')
    .select('shadbala, chart_data, birth_profiles(name)')
    .eq('id', chartId)
    .eq('user_id', userId)
    .single();

  if (error || !chart) {
    return { error: 'Chart not found', status: 404 };
  }

  let shadbala = chart.shadbala as unknown as PlanetShadbala[] | null;
  if (!Array.isArray(shadbala) || shadbala.length === 0) {
    if (!chart.chart_data) return { error: 'Chart data missing', status: 422 };
    shadbala = calculateShadbala(chart.chart_data as unknown as ChartData);
  }

  const profile = Array.isArray(chart.birth_profiles) ? chart.birth_profiles[0] : chart.birth_profiles;
  const profileName = (profile as { name?: string | null } | null)?.name ?? null;

  return { shadbala, profileName };
}

// ============================================================
// GET — axes (always) + AI reading (inline on first visit)
// ============================================================

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

    const result = await loadChartShadbala(supabase, user.id, chartId);
    if ('error' in result) {
      return NextResponse.json<ApiResponse>({ success: false, error: result.error }, { status: result.status });
    }

    const axes = mapShadbalaToAxes(result.shadbala);

    // Check for a cached reading (lite_ai or report_enriched rows have no expiry
    // and are generated once and stored permanently).
    const { data: cached } = await supabase
      .from('feature_insights')
      .select('source, content, expires_at')
      .eq('user_id', user.id)
      .eq('chart_id', chartId)
      .eq('feature_key', 'guna_chakra')
      .eq('params_hash', '')
      .eq('language', language)
      .maybeSingle();

    const now = new Date().toISOString();
    const fresh = cached && (cached.expires_at === null || cached.expires_at > now);
    let content = (fresh ? (cached.content as GunaContent) : null) ?? null;
    let source = fresh ? (cached.source as string) : null;
    const hasAiReading = source === 'lite_ai' || source === 'report_enriched';

    // If no permanent AI reading exists, run generation inline so the user
    // gets content on this very request instead of waiting for a queue worker.
    // Uses the admin client so RLS doesn't block the write to feature_insights.
    if (!hasAiReading) {
      try {
        const admin = createAdminSupabase();
        await runLite(admin, {
          chart_id: chartId,
          feature_key: 'guna_chakra',
          language,
          params_hash: '',
          user_id: user.id,
        });

        // Read back what was written (lite_ai or deterministic fallback)
        const { data: written } = await supabase
          .from('feature_insights')
          .select('source, content, expires_at')
          .eq('user_id', user.id)
          .eq('chart_id', chartId)
          .eq('feature_key', 'guna_chakra')
          .eq('params_hash', '')
          .eq('language', language)
          .maybeSingle();

        if (written?.content) {
          content = written.content as GunaContent;
          source = written.source as string;
        }
      } catch (genErr) {
        console.warn('[guna-chakra] inline generation failed:', genErr instanceof Error ? genErr.message : genErr);
      }
    }

    const aiReady = source === 'lite_ai' || source === 'report_enriched';

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        axes,
        profileName: result.profileName,
        content,
        source,
        generating: !aiReady,
      },
    });
  } catch (error) {
    console.error('Guna Chakra GET error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load Guna Chakra' },
      { status: 500 },
    );
  }
}
