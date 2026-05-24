import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { generateWeeklyAndStore, weekBoundsIST } from '@/lib/horoscope/weeklyGenerate';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { rashi, language } = body as { rashi: string; language?: string };
    if (!rashi) {
      return NextResponse.json({ success: false, error: 'rashi is required' }, { status: 400 });
    }

    const bounds = weekBoundsIST();
    const admin = createAdminSupabase();
    const content = await generateWeeklyAndStore(rashi, language || 'en', bounds, admin);
    return NextResponse.json({ success: true, data: content ?? {} });
  } catch (error) {
    console.error('Weekly horoscope error:', error);
    return NextResponse.json({ success: false, error: 'Failed to get weekly horoscope' }, { status: 500 });
  }
}
