import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ApiResponse } from '@aroha-astrology/shared';

function dedupByType<T extends { type: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.type) ? false : (seen.add(r.type), true)));
}

// ============================================================
// GET /api/kundli/[id]
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabase();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    if (!id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Chart ID is required' },
        { status: 400 },
      );
    }

    // Fetch all data in parallel
    const [
      { data: chart, error: chartError },
      { data: predictions },
      { data: remedies },
      { data: followUpQuestions },
      { data: lalKitabChart },
    ] = await Promise.all([
      supabase
        .from('kundli_charts')
        .select(`
          *,
          birth_profiles (
            id,
            name,
            dob,
            tob,
            tob_source,
            pob,
            latitude,
            longitude,
            timezone,
            gender,
            is_primary
          )
        `)
        .eq('id', id)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('predictions')
        .select('id, type, harsh_mode, content, language, created_at')
        .eq('chart_id', id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('remedies')
        .select('id, type, planet, house, content, created_at')
        .eq('chart_id', id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('follow_up_questions')
        .select('id, question, options, answer, dasha_period, created_at')
        .eq('chart_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('lalkitab_charts')
        .select('*')
        .eq('chart_id', id)
        .maybeSingle(),
    ]);

    if (chartError || !chart) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Chart not found' },
        { status: 404 },
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        chart: {
          id: chart.id,
          profileId: chart.profile_id,
          ayanamsa: chart.ayanamsa,
          chartData: chart.chart_data,
          divisionalCharts: chart.divisional_charts,
          dashaData: chart.dasha_data,
          yogaData: chart.yoga_data,
          doshaData: chart.dosha_data,
          shadbala: chart.shadbala,
          ashtakavarga: chart.ashtakavarga,
          panchangAtBirth: chart.panchang_at_birth,
          createdAt: chart.created_at,
        },
        profile: chart.birth_profiles,
        predictions: dedupByType(predictions ?? []),
        remedies: remedies ?? [],
        followUpQuestions: followUpQuestions ?? [],
        lalKitabChart: lalKitabChart ?? null,
      },
    });
  } catch (error) {
    console.error('Fetch kundli error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch kundli',
      },
      { status: 500 },
    );
  }
}

// ============================================================
// DELETE /api/kundli/[id]
// ============================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabase();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('kundli_charts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error('Delete kundli error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete kundli' },
      { status: 500 },
    );
  }
}
