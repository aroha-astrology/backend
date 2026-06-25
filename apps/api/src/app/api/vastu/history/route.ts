import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ApiResponse } from '@aroha-astrology/shared';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('vastu_analyses')
      .select('id, room_layout, analysis, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json<ApiResponse>({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json<ApiResponse>({ success: true, data: data ?? [] });
  } catch {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Failed to fetch history' }, { status: 500 });
  }
}
