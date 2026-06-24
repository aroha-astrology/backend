import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { buildGroundTruth, type GroundTruthInput } from '@/lib/ai/groundTruth';
import type { ApiResponse } from '@aroha-astrology/shared';

export const runtime = 'nodejs';

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

    // Fetch chart with joined profile
    const { data: chart, error: chartError } = await supabase
      .from('kundli_charts')
      .select(`
        *,
        birth_profiles (
          id, name, dob, tob, pob, gender
        )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (chartError || !chart) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Chart not found' },
        { status: 404 },
      );
    }

    const profile = chart.birth_profiles as { name: string; dob: string; tob: string; pob: string; gender: string };

    const input: GroundTruthInput = {
      name: profile.name,
      dob: profile.dob,
      tob: profile.tob,
      pob: profile.pob,
      gender: profile.gender,
      chartData: chart.chart_data,
      dashaData: chart.dasha_data ?? {},
      yogaData: chart.yoga_data ?? [],
      doshaData: chart.dosha_data ?? {},
      shadbala: chart.shadbala ?? {},
      ashtakavarga: chart.ashtakavarga ?? {},
      panchangAtBirth: (chart.panchang_at_birth as Record<string, unknown>) ?? {},
    };

    const groundTruth = buildGroundTruth(input);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: groundTruth,
    });
  } catch (error) {
    console.error('Insights API error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to compute insights',
      },
      { status: 500 },
    );
  }
}
