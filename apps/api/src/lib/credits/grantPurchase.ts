import type { SupabaseClient } from '@supabase/supabase-js';

// Idempotently grants credits for a paid Razorpay order.
//
// Looks up the order in `credit_orders` (server-side truth — client cannot
// influence pack_id or credits here), atomically marks it 'paid', records a
// credit_transactions row keyed by razorpay_payment_id (UNIQUE), and adds the
// credits to users.credits. Safe to call multiple times for the same payment.
//
// Returns the new credit balance, or null if the order is not found.

export interface GrantResult {
  credits: number;
  packId: string;
  added: number;
  alreadyProcessed: boolean;
}

export async function grantPurchase(
  supabase: SupabaseClient,
  args: { razorpayOrderId: string; razorpayPaymentId: string },
): Promise<GrantResult | null> {
  const { razorpayOrderId, razorpayPaymentId } = args;

  const { data: order, error: orderErr } = await supabase
    .from('credit_orders')
    .select('id, user_id, pack_id, credits, status, razorpay_payment_id')
    .eq('razorpay_order_id', razorpayOrderId)
    .maybeSingle();

  if (orderErr || !order) return null;

  // Already processed — return current balance, do not double-credit.
  if (order.status === 'paid') {
    const { data: u } = await supabase
      .from('users')
      .select('credits')
      .eq('id', order.user_id)
      .single();
    return {
      credits: u?.credits ?? 0,
      packId: order.pack_id,
      added: order.credits,
      alreadyProcessed: true,
    };
  }

  // Insert transaction first; UNIQUE(razorpay_payment_id) guards against
  // concurrent verify + webhook awarding twice.
  const { error: txErr } = await supabase.from('credit_transactions').insert({
    user_id: order.user_id,
    amount: order.credits,
    type: 'purchase',
    description: `Purchased ${order.credits} tokens (order ${razorpayOrderId})`,
    razorpay_payment_id: razorpayPaymentId,
  });

  if (txErr && txErr.code === '23505') {
    // Another request won the race — read balance and return.
    const { data: u } = await supabase
      .from('users')
      .select('credits')
      .eq('id', order.user_id)
      .single();
    await supabase
      .from('credit_orders')
      .update({ status: 'paid', razorpay_payment_id: razorpayPaymentId, updated_at: new Date().toISOString() })
      .eq('id', order.id);
    return {
      credits: u?.credits ?? 0,
      packId: order.pack_id,
      added: order.credits,
      alreadyProcessed: true,
    };
  }
  if (txErr) throw txErr;

  // Credit the user. Try the existing RPC ladder for atomicity.
  const { error: rpcErr } = await supabase.rpc('add_credits', {
    p_user_id: order.user_id,
    p_amount: order.credits,
  });
  if (rpcErr) {
    const { error: incErr } = await supabase.rpc('increment_credits', {
      p_user_id: order.user_id,
      p_amount: order.credits,
    });
    if (incErr) {
      const { data: cur } = await supabase
        .from('users')
        .select('credits')
        .eq('id', order.user_id)
        .single();
      const next = (cur?.credits ?? 0) + order.credits;
      const { error: upErr } = await supabase
        .from('users')
        .update({ credits: next })
        .eq('id', order.user_id);
      if (upErr) throw upErr;
    }
  }

  // Mark order paid.
  await supabase
    .from('credit_orders')
    .update({ status: 'paid', razorpay_payment_id: razorpayPaymentId, updated_at: new Date().toISOString() })
    .eq('id', order.id);

  const { data: after } = await supabase
    .from('users')
    .select('credits')
    .eq('id', order.user_id)
    .single();

  return {
    credits: after?.credits ?? 0,
    packId: order.pack_id,
    added: order.credits,
    alreadyProcessed: false,
  };
}
