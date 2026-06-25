import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { grantPurchase } from '@/lib/credits/grantPurchase';

// Razorpay webhook handler.
//
// Configure in Razorpay dashboard: Webhooks → Add → URL = https://<domain>/api/webhooks/razorpay
// Active events: payment.captured, refund.processed, refund.created
// Set RAZORPAY_WEBHOOK_SECRET in Vercel env to the secret you choose there.
//
// We treat webhooks as the eventual-consistency safety net; the client-side
// /verify call is the primary path and usually wins. Both paths are idempotent
// via UNIQUE(razorpay_payment_id) on credit_transactions.

export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[razorpay/webhook] RAZORPAY_WEBHOOK_SECRET not set');
    return NextResponse.json({ ok: false, error: 'Webhook not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  try {
    switch (event.event) {
      case 'payment.captured': {
        const payment = event?.payload?.payment?.entity;
        if (!payment?.order_id || !payment?.id) break;
        await grantPurchase(admin, {
          razorpayOrderId: payment.order_id,
          razorpayPaymentId: payment.id,
        });
        break;
      }

      case 'payment.failed': {
        const payment = event?.payload?.payment?.entity;
        if (payment?.order_id) {
          await admin
            .from('credit_orders')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('razorpay_order_id', payment.order_id);
        }
        break;
      }

      case 'refund.processed':
      case 'refund.created': {
        const refund = event?.payload?.refund?.entity;
        const paymentId = refund?.payment_id;
        if (!paymentId) break;

        // Find the original purchase transaction.
        const { data: tx } = await admin
          .from('credit_transactions')
          .select('id, user_id, amount')
          .eq('razorpay_payment_id', paymentId)
          .eq('type', 'purchase')
          .maybeSingle();

        if (!tx) break;

        // Have we already recorded a refund for this payment?
        const refundDescription = `Refund for payment ${paymentId}`;
        const { data: existingRefund } = await admin
          .from('credit_transactions')
          .select('id')
          .eq('user_id', tx.user_id)
          .eq('type', 'refund')
          .eq('description', refundDescription)
          .maybeSingle();
        if (existingRefund) break;

        // Reverse credits. Do NOT take balance below zero.
        const { data: u } = await admin
          .from('users')
          .select('credits')
          .eq('id', tx.user_id)
          .single();
        const current = u?.credits ?? 0;
        const reverse = Math.min(current, tx.amount);

        await admin.from('credit_transactions').insert({
          user_id: tx.user_id,
          amount: -reverse,
          type: 'refund',
          description: refundDescription,
          razorpay_payment_id: null,
        });
        await admin
          .from('users')
          .update({ credits: current - reverse })
          .eq('id', tx.user_id);
        await admin
          .from('credit_orders')
          .update({ status: 'refunded', updated_at: new Date().toISOString() })
          .eq('razorpay_payment_id', paymentId);
        break;
      }

      default:
        // Unhandled event — ack so Razorpay doesn't retry.
        break;
    }
  } catch (err) {
    console.error('[razorpay/webhook] processing error:', err, 'event:', event?.event);
    // Return 500 so Razorpay retries (up to ~24h).
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
