import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data: video } = await supabase
      .from('video_readings')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!video) {
      return NextResponse.json({ success: false, error: 'Video not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: video.id,
        status: video.status,
        script: video.script,
        audio_url: video.audio_url,
        video_url: video.video_url,
        duration_seconds: video.duration_seconds,
        type: video.type,
        language: video.language,
      },
    });
  } catch (error) {
    console.error('Video status error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch status' }, { status: 500 });
  }
}
