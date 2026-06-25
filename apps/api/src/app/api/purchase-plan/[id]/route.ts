export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data: plan, error } = await supabase
      .from('purchase_plans')
      .select('id, status, analysis, error_message, category, resolved_booking_date, resolved_delivery_date, created_at, completed_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !plan) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: plan });
  } catch (err) {
    console.error('[purchase-plan/[id]]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
