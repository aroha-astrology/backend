import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getPack, rupeesToPaise } from '@/lib/credits/packs';
import { rateLimit } from '@/lib/rateLimit';
import Razorpay from 'razorpay';
import type { ApiResponse } from '@aroha-astrology/shared';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const limited = await rateLimit(`order:${user.id}`, { limit: 10, windowSec: 60 });
    if (limited) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Too many order attempts. Please wait a moment.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({}));

    // Accept single pack_id (legacy) or pack_ids[] (multi-pack)
    const rawIds: string[] = body.pack_ids
      ? (body.pack_ids as string[])
      : [(body.pack_id ?? body.packId) as string | undefined].filter(Boolean) as string[];

    // Optional custom credits (₹10 per Dhanam, min 5, max 500)
    const customCredits = Number(body.custom_credits ?? 0);
    const hasCustom = Number.isInteger(customCredits) && customCredits >= 5 && customCredits <= 10000;

    if (rawIds.length === 0 && !hasCustom) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'No packs specified' }, { status: 400 });
    }

    const packs = rawIds.map(getPack);
    if (packs.some((p) => !p)) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Invalid pack' }, { status: 400 });
    }
    const validPacks = packs as NonNullable<ReturnType<typeof getPack>>[];

    const CUSTOM_RATE_RUPEES = 10; // ₹10 per Dhanam for custom
    const packCredits = validPacks.reduce((s, p) => s + p.credits, 0);
    const packRupees  = validPacks.reduce((s, p) => s + p.priceRupees, 0);
    const totalCredits = packCredits + (hasCustom ? customCredits : 0);
    const totalRupees  = packRupees  + (hasCustom ? customCredits * CUSTOM_RATE_RUPEES : 0);
    const comboPackId  = [...validPacks.map((p) => p.id), ...(hasCustom ? [`custom_${customCredits}`] : [])].join('+') || `custom_${customCredits}`;

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Payment gateway not configured' },
        { status: 500 },
      );
    }

    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const amountPaise = rupeesToPaise(totalRupees);
    const receipt = `cr_${user.id.slice(0, 8)}_${Date.now().toString(36)}`.slice(0, 40);

    const rzpOrder = await rzp.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: { user_id: user.id, pack_id: comboPackId },
    });

    // Persist order server-side so verify/webhook can trust pack_id and amount.
    const admin = createAdminSupabase();
    const { error: insertErr } = await admin.from('credit_orders').insert({
      user_id: user.id,
      razorpay_order_id: rzpOrder.id,
      pack_id: comboPackId,
      credits: totalCredits,
      amount_paise: amountPaise,
      currency: 'INR',
      status: 'created',
    });
    if (insertErr) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Failed to record order' },
        { status: 500 },
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        order_id: rzpOrder.id,
        amount: amountPaise,
        currency: 'INR',
        razorpay_key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? keyId,
      },
    });
  } catch (err) {
    console.error('[credits/order] error:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: err instanceof Error ? err.message : 'Order creation failed' },
      { status: 500 },
    );
  }
}
