import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import crypto from 'crypto';
import type { ApiResponse, CreditPurchaseRequest } from '@aroha-astrology/shared';

// ============================================================
// Credit pack definitions
// ============================================================

const CREDIT_PACKS = [
  { id: 'pack_10', credits: 10, price: 99, label: 'Starter Pack (10 credits)' },
  { id: 'pack_30', credits: 30, price: 199, label: 'Popular Pack (30 credits)' },
  { id: 'pack_100', credits: 100, price: 599, label: 'Best Value Pack (100 credits)' },
];

// ============================================================
// POST /api/credits/purchase
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const {
      packId,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    } = body as CreditPurchaseRequest & {
      razorpayPaymentId?: string;
      razorpayOrderId?: string;
      razorpaySignature?: string;
    };

    // Validate pack
    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    if (!pack) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Invalid credit pack' },
        { status: 400 },
      );
    }

    // Verify Razorpay payment signature if provided
    if (razorpayPaymentId && razorpayOrderId && razorpaySignature) {
      const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!razorpaySecret) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: 'Payment gateway not configured' },
          { status: 500 },
        );
      }

      const expectedSignature = crypto
        .createHmac('sha256', razorpaySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (expectedSignature !== razorpaySignature) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: 'Invalid payment signature. Payment verification failed.' },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Payment verification data is required' },
        { status: 400 },
      );
    }

    // Check for duplicate payment to prevent double-crediting on concurrent requests
    if (razorpayPaymentId) {
      const { data: existingTx } = await supabase
        .from('credit_transactions')
        .select('id')
        .eq('razorpay_payment_id', razorpayPaymentId)
        .maybeSingle();

      if (existingTx) {
        // Payment already processed — return success without adding credits again
        const { data: userData } = await supabase
          .from('users')
          .select('credits')
          .eq('id', user.id)
          .single();

        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            credits: userData?.credits ?? 0,
            purchased: pack.credits,
            packId: pack.id,
          },
          message: `Payment already processed. ${pack.credits} credits were previously added.`,
        });
      }
    }

    // Record transaction FIRST so the razorpay_payment_id acts as a guard
    // against concurrent requests (unique constraint on razorpay_payment_id).
    const { error: txError } = await supabase.from('credit_transactions').insert({
      user_id: user.id,
      amount: pack.credits,
      type: 'purchase',
      description: `Purchased ${pack.label} for INR ${pack.price}`,
      razorpay_payment_id: razorpayPaymentId || null,
    });

    if (txError) {
      // If insert failed due to duplicate razorpay_payment_id, another request won the race
      if (txError.code === '23505') {
        const { data: userData } = await supabase
          .from('users')
          .select('credits')
          .eq('id', user.id)
          .single();

        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            credits: userData?.credits ?? 0,
            purchased: pack.credits,
            packId: pack.id,
          },
          message: `Payment already processed. ${pack.credits} credits were previously added.`,
        });
      }
      console.error('Failed to record transaction:', txError);
    }

    // Add credits to user atomically using RPC if available
    const { error: rpcError } = await supabase.rpc('add_credits', {
      p_user_id: user.id,
      p_amount: pack.credits,
    });

    if (rpcError) {
      // Fallback: use Postgres increment to avoid read-then-write race condition
      const { error: updateError } = await supabase.rpc('increment_credits', {
        p_user_id: user.id,
        p_amount: pack.credits,
      });

      if (updateError) {
        // Last resort fallback: direct update (less safe but functional)
        const { data: currentUser } = await supabase
          .from('users')
          .select('credits')
          .eq('id', user.id)
          .single();

        const currentCredits = currentUser?.credits ?? 0;

        const { error: directUpdateError } = await supabase
          .from('users')
          .update({ credits: currentCredits + pack.credits })
          .eq('id', user.id);

        if (directUpdateError) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: `Failed to update credits: ${directUpdateError.message}` },
            { status: 500 },
          );
        }
      }
    }

    // Get updated credits
    const { data: userData } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        credits: userData?.credits ?? 0,
        purchased: pack.credits,
        packId: pack.id,
      },
      message: `Successfully added ${pack.credits} credits to your account`,
    });
  } catch (error) {
    console.error('Credit purchase error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Payment processing failed',
      },
      { status: 500 },
    );
  }
}
