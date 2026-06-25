import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('birth_profiles')
      .select('id, name, dob, tob, tob_source, pob, latitude, longitude, timezone, gender, is_primary, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Failed to fetch profiles' }, { status: 500 });
  }
}
