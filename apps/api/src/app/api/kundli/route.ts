import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('kundli_charts')
      .select('id, profile_id, user_id, ayanamsa, chart_data, divisional_charts, dasha_data, yoga_data, dosha_data, created_at, birth_profiles(id, name, dob, tob, pob, latitude, longitude, timezone, gender)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Failed to fetch charts' }, { status: 500 });
  }
}
