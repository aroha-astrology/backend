import type { SupabaseClient } from '@supabase/supabase-js';

export type DebitType = 'feature_debit' | 'chat_debit' | 'report_debit';

interface DeductResult {
  success: boolean;
  credits?: number;
  error?: string;
}

/**
 * Atomically deducts tokens from the user's balance via the deduct_credits RPC.
 * Returns { success: false, error: 'INSUFFICIENT_TOKENS' } when balance is too low.
 */
export async function deductCredits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  amount: number,
  type: DebitType,
  description: string,
): Promise<DeductResult> {
  const { data: newCredits, error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    const isInsufficient =
      error.message?.includes('INSUFFICIENT_TOKENS') ||
      error.code === 'P0001';
    return {
      success: false,
      error: isInsufficient ? 'INSUFFICIENT_TOKENS' : 'Failed to deduct credits',
    };
  }

  // Record the transaction for history
  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: -amount,
    type,
    description,
  });

  return { success: true, credits: newCredits as number };
}

/**
 * Refund tokens previously deducted (e.g. when AI output fails validation and we don't store it).
 * Logs a positive credit_transactions row so admins can audit refunds.
 * Best-effort: errors are logged but not thrown — the caller's primary flow already failed.
 */
export async function refundCredits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  amount: number,
  description: string,
): Promise<void> {
  try {
    const { error: rpcError } = await supabase.rpc('increment_credits', {
      p_user_id: userId,
      p_amount: amount,
    });
    if (rpcError) {
      console.error('[refundCredits] increment_credits RPC failed:', rpcError);
      return;
    }
    // Audit row is best-effort: 'refund' isn't in the credit_transactions type check yet,
    // so the insert may fail. The actual credit refund already happened via the RPC above.
    const { error: insertError } = await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount,
      type: 'refund',
      description,
    });
    if (insertError) {
      console.warn(`[refundCredits] audit row failed (refund itself succeeded): ${insertError.message}`);
    }
  } catch (err) {
    console.error('[refundCredits] unexpected error:', err);
  }
}
