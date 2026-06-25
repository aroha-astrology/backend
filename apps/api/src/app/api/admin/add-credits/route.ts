import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

// POST /api/admin/add-credits
// Body: { userId: string; amount: number; note?: string }
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
  const { userId, amount, note } = body as { userId: string; amount: number; note?: string };

  if (!userId || !Number.isInteger(amount) || amount < 1 || amount > 1000) {
    return NextResponse.json({ error: 'userId and amount (1–1000) are required' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  const { error: rpcErr } = await admin.rpc('increment_credits', {
    p_user_id: userId,
    p_amount: amount,
  });

  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

  await admin.from('credit_transactions').insert({
    user_id: userId,
    amount,
    type: 'admin_grant',
    description: note?.trim() || `Admin added ${amount} token${amount !== 1 ? 's' : ''}`,
  });

  const { data: updated } = await admin
    .from('users')
    .select('credits')
    .eq('id', userId)
    .single();

  return NextResponse.json({ success: true, credits: updated?.credits ?? 0 });
}
