import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { grantPurchase } from '@/lib/credits/grantPurchase';
import { rateLimit } from '@/lib/rateLimit';
import type { ApiResponse } from '@aroha-astrology/shared';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const limited = await rateLimit(`verify:${user.id}`, { limit: 20, windowSec: 60 });
    if (limited) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Too many verification attempts.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const razorpayOrderId   = body.razorpay_order_id   as string | undefined;
    const razorpayPaymentId = body.razorpay_payment_id as string | undefined;
    const razorpaySignature = body.razorpay_signature  as string | undefined;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Missing payment fields' },
        { status: 400 },
      );
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Payment gateway not configured' },
        { status: 500 },
      );
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpaySignature))) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Invalid payment signature' },
        { status: 400 },
      );
    }

    const admin = createAdminSupabase();

    // Defense in depth: ensure the order belongs to this caller.
    const { data: orderRow } = await admin
      .from('credit_orders')
      .select('user_id')
      .eq('razorpay_order_id', razorpayOrderId)
      .maybeSingle();
    if (!orderRow || orderRow.user_id !== user.id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Order not found' },
        { status: 404 },
      );
    }

    const result = await grantPurchase(admin, { razorpayOrderId, razorpayPaymentId });
    if (!result) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Order not found' },
        { status: 404 },
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        credits: result.credits,
        purchased: result.added,
        packId: result.packId,
      },
      message: result.alreadyProcessed
        ? `Payment already processed.`
        : `Added ${result.added} tokens.`,
    });
  } catch (err) {
    console.error('[credits/verify] error:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : 'Verification failed' },
      { status: 500 },
    );
  }
}
