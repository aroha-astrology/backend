import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ASTRO_PLANS } from '@aroha-astrology/shared';
import type { AstroPlan } from '@aroha-astrology/shared';

// POST /api/admin/astrologer/approve
// Body: { userId: string, plan: AstroPlan }
export async function POST(req: NextRequest) {
  const userSupabase = await createServerSupabase();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await userSupabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!caller?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { userId, plan } = body as { userId: string; plan: AstroPlan };

  if (!userId || !plan || !ASTRO_PLANS[plan]) {
    return NextResponse.json({ error: 'userId and valid plan are required' }, { status: 400 });
  }

  const customerLimit = ASTRO_PLANS[plan].customers;
  const admin = createAdminSupabase();

  const { error } = await admin
    .from('users')
    .update({
      astro_status: 'approved',
      astro_plan: plan,
      customer_limit: customerLimit,
    })
    .eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, plan, customer_limit: customerLimit });
}
