import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { generateVideoScript } from '@/lib/ai/videoScript';
import { deductCredits } from '@/lib/credits/deductCredits';
import { VIDEO_CREDIT_COSTS } from '@aroha-astrology/shared';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { chartId, type, language, focusArea, specificQuestion } = await request.json();

    if (!chartId || !type) {
      return NextResponse.json({ success: false, error: 'Chart ID and type required' }, { status: 400 });
    }

    // Deduct 1 token for video reading generation
    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Video Kundli reading generation');
    if (!creditResult.success) {
      return NextResponse.json({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }

    // Create video reading record
    const { data: videoReading } = await supabase
      .from('video_readings')
      .insert({
        user_id: user.id,
        chart_id: chartId,
        type,
        language: language || 'en',
        credits_used: 0,
        status: 'pending',
      })
      .select()
      .single();

    // Fetch chart data for script generation
    const { data: chart } = await supabase
      .from('kundli_charts')
      .select('*, birth_profiles(*)')
      .eq('id', chartId)
      .single();

    if (!chart) {
      return NextResponse.json({ success: false, error: 'Chart not found' }, { status: 404 });
    }

    // Update status to generating
    await supabase
      .from('video_readings')
      .update({ status: 'generating' })
      .eq('id', videoReading?.id);

    // Generate script asynchronously (in production, this would be a background job)
    try {
      const script = await generateVideoScript({
        chartData: chart.chart_data as never,
        dashas: chart.dasha_data as never,
        doshas: chart.dosha_data as never,
        yogas: (chart.yoga_data as never) || [],
        profileName: (((chart as Record<string, unknown>).birth_profiles as Record<string, unknown> | undefined)?.name as string) || 'Friend',
        type: type as 'quick' | 'standard' | 'detailed',
        language: (language || 'en') as 'en' | 'hi' | 'ta',
        focusArea: focusArea || 'General',
        specificQuestion,
      });

      await supabase
        .from('video_readings')
        .update({ script, status: 'ready' })
        .eq('id', videoReading?.id);
    } catch {
      await supabase
        .from('video_readings')
        .update({ status: 'failed' })
        .eq('id', videoReading?.id);
    }

    return NextResponse.json({
      success: true,
      data: { videoId: videoReading?.id, status: 'pending' },
    });
  } catch (error) {
    console.error('Video generation error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate video' }, { status: 500 });
  }
}
