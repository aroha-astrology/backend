export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * POST /api/credits/refund-short-call
 *
 * Refunds the 1-token chat-session deduction when the user ends a call within
 * a few seconds of starting it. Anti-abuse: only refunds if there is an active
 * chat session that was created in the last 60 seconds, and only refunds 1
 * token (the deduction made by /api/chat/stream when a fresh session begins).
 *
 * Also clears chat_session_expires so the user pays again for their next call.
 */
export async function POST() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('chat_session_expires, credits')
      .eq('id', user.id)
      .single();

    const expiresStr = userData?.chat_session_expires as string | null | undefined;
    if (!expiresStr) {
      // No active session — nothing was deducted, nothing to refund.
      return NextResponse.json({ success: true, data: { refunded: 0, credits: userData?.credits ?? 0 } });
    }

    // Sessions are 3 minutes long. Only refund if it was created within the last 60s.
    const expires = new Date(expiresStr).getTime();
    const createdAt = expires - 3 * 60 * 1000;
    const ageMs = Date.now() - createdAt;
    if (ageMs > 60_000) {
      return NextResponse.json({
        success: false,
        error: 'Session too old to refund',
        data: { credits: userData?.credits ?? 0 },
      });
    }

    const refundAmount = 1;
    const { data: newCredits, error: rpcError } = await supabase.rpc('increment_credits', {
      p_user_id: user.id,
      p_amount: refundAmount,
    });

    if (rpcError) {
      console.error('[refund-short-call] increment_credits failed:', rpcError);
      return NextResponse.json(
        { success: false, error: rpcError.message, data: { credits: userData?.credits ?? 0 } },
        { status: 500 },
      );
    }

    // Log the refund and clear the session window.
    await supabase.from('credit_transactions').insert({
      user_id: user.id,
      amount: refundAmount,
      type: 'chat_debit',
      description: 'Short call refund (<3s)',
    });
    await supabase.from('users').update({ chat_session_expires: null }).eq('id', user.id);

    return NextResponse.json({
      success: true,
      data: { refunded: refundAmount, credits: newCredits as number },
    });
  } catch (err) {
    console.error('[refund-short-call] error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Refund failed' },
      { status: 500 },
    );
  }
}
