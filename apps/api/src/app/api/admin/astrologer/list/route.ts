import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

// GET /api/admin/astrologer/list
export async function GET() {
  const userSupabase = await createServerSupabase();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await userSupabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!caller?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminSupabase();

  const { data, error } = await admin
    .from('users')
    .select('id, name, email, astro_status, astro_plan, customer_limit, created_at')
    .contains('roles', ['astrologer'])
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach current customer counts
  const ids = (data ?? []).map((u) => u.id);
  const { data: counts } = await admin
    .from('astrologer_customers')
    .select('astrologer_id')
    .in('astrologer_id', ids);

  const countMap = (counts ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.astrologer_id] = (acc[row.astrologer_id] ?? 0) + 1;
    return acc;
  }, {});

  const enriched = (data ?? []).map((u) => ({
    ...u,
    customer_count: countMap[u.id] ?? 0,
  }));

  return NextResponse.json({ success: true, data: enriched });
}
