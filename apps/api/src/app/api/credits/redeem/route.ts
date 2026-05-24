import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { notifyVoiceCallEnabled, notifyCouponRedeemed } from '@/lib/telegram';
import type { ApiResponse } from '@aroha-astrology/shared';

// POST /api/credits/redeem
// Body: { code: string }
//
// Coupon types:
//   • Token coupon       — token_amount > 0, single-use (legacy JY1-/JY2-/JYOTISH40)
//   • Perk coupon        — grants_perk set (e.g. 'voice_call'), token_amount may be 0
//   • Reusable perk      — is_reusable=true, tracked per-user via coupon_redemptions table
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';

    if (!code) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Coupon code is required' },
        { status: 400 },
      );
    }

    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select('id, code, token_amount, is_used, used_by, grants_perk, is_reusable')
      .eq('code', code)
      .maybeSingle();

    if (couponError || !coupon) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Invalid coupon code' },
        { status: 404 },
      );
    }

    const isReusable = coupon.is_reusable === true;

    if (isReusable) {
      // Reusable coupons (e.g. IWANTCALL) — each user can redeem at most once,
      // tracked in coupon_redemptions. The legacy is_used flag is irrelevant here.
      const { data: prior } = await supabase
        .from('coupon_redemptions')
        .select('id')
        .eq('coupon_id', coupon.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (prior) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: 'You have already redeemed this coupon' },
          { status: 409 },
        );
      }
      const { error: insertError } = await supabase
        .from('coupon_redemptions')
        .insert({ coupon_id: coupon.id, user_id: user.id });
      if (insertError) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: 'Could not record redemption' },
          { status: 409 },
        );
      }
    } else {
      // Single-use coupon
      if (coupon.is_used) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: 'This coupon has already been used' },
          { status: 409 },
        );
      }
      const { error: markError } = await supabase
        .from('coupons')
        .update({ is_used: true, used_by: user.id, used_at: new Date().toISOString() })
        .eq('id', coupon.id)
        .eq('is_used', false); // optimistic guard against race
      if (markError) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: 'Coupon already redeemed or error occurred' },
          { status: 409 },
        );
      }
    }

    // Add tokens (only if the coupon grants any)
    if (coupon.token_amount > 0) {
      const { error: addError } = await supabase.rpc('increment_credits', {
        p_user_id: user.id,
        p_amount: coupon.token_amount,
      });
      if (addError) {
        const { data: cur } = await supabase.from('users').select('credits').eq('id', user.id).single();
        await supabase.from('users').update({ credits: (cur?.credits ?? 0) + coupon.token_amount }).eq('id', user.id);
      }
      await supabase.from('credit_transactions').insert({
        user_id: user.id,
        amount: coupon.token_amount,
        type: 'coupon_redeem',
        description: `Coupon ${coupon.code} redeemed (+${coupon.token_amount} token${coupon.token_amount !== 1 ? 's' : ''})`,
      });
    }

    // Apply perks (currently only 'voice_call' but the column is open-ended)
    let perkAppliedMessage: string | null = null;
    if (coupon.grants_perk === 'voice_call') {
      await supabase.from('users').update({ voice_call_enabled: true }).eq('id', user.id);
      perkAppliedMessage = 'Voice call feature unlocked! You can now start a call from any chat.';
      // Awaited: on Vercel serverless, returning the response can terminate the
      // function before an un-awaited fetch lands, swallowing the notification.
      // Telegram POSTs in ~200ms; sendTelegramMessage already absorbs errors.
      await notifyVoiceCallEnabled(user.email ?? '(unknown)', coupon.code);
    }

    const { data: userData } = await supabase
      .from('users')
      .select('credits, voice_call_enabled, name, phone')
      .eq('id', user.id)
      .single();

    // Telegram alert for every successful coupon redemption
    await notifyCouponRedeemed({
      code: coupon.code,
      tokens: coupon.token_amount ?? 0,
      perk: coupon.grants_perk ?? null,
      userName: userData?.name ?? '(unknown)',
      userContact: userData?.phone ?? user.email ?? '(no contact)',
    });

    const tokenMsg = coupon.token_amount > 0
      ? `${coupon.token_amount} token${coupon.token_amount !== 1 ? 's' : ''} added.`
      : null;
    const message = [tokenMsg, perkAppliedMessage].filter(Boolean).join(' ') || 'Coupon redeemed.';

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        tokens_added: coupon.token_amount,
        credits: userData?.credits ?? 0,
        voice_call_enabled: userData?.voice_call_enabled ?? false,
        perk: coupon.grants_perk ?? null,
      },
      message,
    });
  } catch (error) {
    console.error('Coupon redeem error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Failed to redeem coupon' },
      { status: 500 },
    );
  }
}
