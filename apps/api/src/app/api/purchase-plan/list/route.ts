export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data: plans, error } = await supabase
      .from('purchase_plans')
      .select('id, category, status, analysis, resolved_booking_date, resolved_delivery_date, created_at, completed_at, language, metadata')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data: plans ?? [] });
  } catch (err) {
    console.error('[purchase-plan/list]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
