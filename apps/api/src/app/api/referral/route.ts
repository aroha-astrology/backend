import { NextResponse } from 'next/server';
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase/server';
import type { ApiResponse } from '@aroha-astrology/shared';

const REFERRER_BONUS = 20;
const INVITEE_BONUS = 10;

function getAppBase() {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? 'https://arohaastrology.in';
  return raw.replace(/\/+$/, '');
}

function buildShareTemplates(code: string) {
  const base = getAppBase();
  const link = `${base}/signup?ref=${code}`;

  const longBody = `Unlock your cosmic path on Aroha Astrology. Use my code ${code} to start with +${INVITEE_BONUS} Dhanam → ${link}`;
  const smsBody = `Join Aroha Astrology. Code ${code} = +${INVITEE_BONUS} Dhanam: ${link}`;

  return {
    link,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(longBody)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`Aroha Astrology gifted me Dhanam. Use code ${code} for +${INVITEE_BONUS} yours.`)}`,
    sms: `sms:?body=${encodeURIComponent(smsBody)}`,
    rawMessage: longBody,
  };
}

export async function GET() {
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

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('referral_code, referral_popup_seen_at')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.referral_code) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Referral code not yet assigned' },
        { status: 500 },
      );
    }

    const code = profile.referral_code;

    // Stats: invitees who joined via this user's code.
    const { data: invitees } = await supabase
      .from('users')
      .select('id, name, created_at, referral_bonus_paid')
      .eq('referred_by', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const totalReferrals = invitees?.length ?? 0;
    const paidCount = (invitees ?? []).filter((u) => u.referral_bonus_paid).length;
    const totalDhanamEarned = paidCount * REFERRER_BONUS;
    const pendingCredits = (totalReferrals - paidCount) * REFERRER_BONUS;

    const recentReferrals = (invitees ?? []).slice(0, 10).map((u) => {
      const first = (u.name ?? '').trim().split(/\s+/)[0] || 'A friend';
      return {
        name: first,
        joinedAt: u.created_at,
        paid: u.referral_bonus_paid,
        // mobile-compat aliases
        date: u.created_at,
        status: u.referral_bonus_paid ? 'completed' : 'pending',
      };
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        referralCode: code,
        share: buildShareTemplates(code),
        totalReferrals,
        totalDhanamEarned,
        recentReferrals,
        referrerBonus: REFERRER_BONUS,
        inviteeBonus: INVITEE_BONUS,
        popupSeen: !!profile.referral_popup_seen_at,
        // mobile-compat aliases
        creditsEarned: totalDhanamEarned,
        pendingCredits,
        history: recentReferrals,
      },
    });
  } catch (error) {
    console.error('Referral GET error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch referral data',
      },
      { status: 500 },
    );
  }
}

// POST /api/referral — redeem a referral code for an existing logged-in user.
// Used by the in-app "Have a referral code?" flow on the Referral screen.
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ success: false, error: 'Enter a valid 6-digit referral code' }, { status: 400 });
    }

    // Check current state — already referred? own code?
    const { data: me } = await supabase
      .from('users')
      .select('referred_by, referral_code')
      .eq('id', user.id)
      .single();

    if (me?.referred_by) {
      return NextResponse.json({ success: false, error: 'You have already used a referral code' }, { status: 400 });
    }
    if (me?.referral_code === code) {
      return NextResponse.json({ success: false, error: 'You cannot use your own referral code' }, { status: 400 });
    }

    // Look up referrer
    const { data: referrer } = await supabase
      .from('users')
      .select('id')
      .eq('referral_code', code)
      .maybeSingle();

    if (!referrer) {
      return NextResponse.json({ success: false, error: 'Referral code not found' }, { status: 404 });
    }

    // Set referred_by via admin client (bypasses RLS on users table)
    const adminSupabase = await createAdminSupabase();
    const { error: updateError } = await adminSupabase
      .from('users')
      .update({ referred_by: referrer.id })
      .eq('id', user.id);

    if (updateError) {
      console.error('[referral POST] update error:', updateError);
      return NextResponse.json({ success: false, error: 'Failed to apply referral code' }, { status: 500 });
    }

    // If the user already finished onboarding (has a primary profile), pay the bonus now.
    // Otherwise it fires automatically when they generate their first kundli.
    const { data: primaryProfile } = await supabase
      .from('birth_profiles')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .maybeSingle();

    if (primaryProfile) {
      const { error: rpcError } = await adminSupabase.rpc('pay_referral_bonus', { p_invitee_id: user.id });
      if (rpcError) console.warn('[referral POST] pay_referral_bonus error:', rpcError.message);
    }

    const message = primaryProfile
      ? 'Code applied! Dhanam credited to both accounts.'
      : 'Code accepted! Dhanam will be credited once you complete onboarding.';

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('Referral POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to redeem referral code' },
      { status: 500 },
    );
  }
}
