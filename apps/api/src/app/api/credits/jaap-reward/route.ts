import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * POST /api/credits/jaap-reward
 * Body: { key: string }   // mantra key, e.g. "mars"
 *
 * Grants the configured `reward_credits` for completing a 108-count
 * jaap session, enforced once per (user, mantra) per UTC day so users
 * can't loop the screen to farm credits.
 *
 * 200 → { success: true, credits: <new balance>, granted: <amount> }
 * 401 → unauthorized
 * 404 → unknown mantra key
 * 409 → already claimed this mantra today
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  if (!key) {
    return NextResponse.json(
      { success: false, error: 'Mantra key is required' },
      { status: 400 },
    );
  }

  const { data: mantra, error: mantraErr } = await supabase
    .from('mantras')
    .select('key, name, reward_credits')
    .eq('key', key)
    .maybeSingle();

  if (mantraErr || !mantra) {
    return NextResponse.json(
      { success: false, error: 'Unknown mantra' },
      { status: 404 },
    );
  }

  // Idempotency window: one reward per mantra per UTC day.
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const description = `Mantra Jaap — ${mantra.key}`;

  const { data: existing } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', user.id)
    .eq('type', 'jaap_reward')
    .eq('description', description)
    .gte('created_at', dayStart.toISOString())
    .limit(1);

  if (existing && existing.length > 0) {
    const { data: cur } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();
    return NextResponse.json(
      { success: false, error: 'Already claimed today', credits: cur?.credits ?? 0 },
      { status: 409 },
    );
  }

  const amount = mantra.reward_credits ?? 1;

  const { data: newCredits, error: rpcErr } = await supabase.rpc('increment_credits', {
    p_user_id: user.id,
    p_amount: amount,
  });

  if (rpcErr) {
    return NextResponse.json(
      { success: false, error: 'Failed to grant reward' },
      { status: 500 },
    );
  }

  const { error: txErr } = await supabase.from('credit_transactions').insert({
    user_id: user.id,
    amount,
    type: 'jaap_reward',
    description,
  });

  if (txErr) {
    // Reward already credited via RPC; log but don't fail.
    console.warn('[jaap-reward] audit row failed:', txErr.message);
  }

  return NextResponse.json({
    success: true,
    credits: newCredits as number,
    granted: amount,
  });
}
