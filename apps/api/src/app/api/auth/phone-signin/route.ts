import { after, NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { createAdminSupabase } from '@/lib/supabase/server';
import { notifyNewSignup, notifyUserLogin, notifyRoleLogin } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const { idToken, referralCode } = (await req.json()) as {
      idToken?: string;
      referralCode?: string;
    };
    if (!idToken) {
      return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
    }

    const normalisedReferralCode =
      typeof referralCode === 'string' && /^\d{6}$/.test(referralCode.trim())
        ? referralCode.trim()
        : null;

    // 1. Verify Firebase ID token → extract phone number
    const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const phone = decoded.phone_number;
    if (!phone) {
      return NextResponse.json({ error: 'No phone number in token' }, { status: 400 });
    }

    const adminSupabase = await createAdminSupabase();

    // 2. Look up existing user row by phone
    const { data: existingUser } = await adminSupabase
      .from('users')
      .select('id, name, roles')
      .eq('phone', phone)
      .maybeSingle();

    let supabaseUserId: string;
    let isNewUser = false;
    let userEmail: string;
    let referralAccepted = false;
    // Phantom email satisfies Supabase auth's identifier requirement for phone-only accounts
    const phantomEmail = `${phone.replace('+', '')}@phone.arohaastrology.in`;

    if (!existingUser) {
      // 3a. New user — create Supabase auth account
      const { data: newAuthUser, error: createErr } =
        await adminSupabase.auth.admin.createUser({
          email: phantomEmail,
          phone,
          phone_confirm: true,
          email_confirm: true,
          user_metadata: { phone },
        });

      if (createErr || !newAuthUser.user) {
        console.error('[phone-signin] createUser error:', createErr);
        return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
      }

      supabaseUserId = newAuthUser.user.id;
      userEmail = newAuthUser.user.email ?? phantomEmail;
      isNewUser = true;

      // Resolve referral code → referrer.id (silent on miss, self-ref guarded)
      let referredById: string | null = null;
      if (normalisedReferralCode) {
        const { data: referrer } = await adminSupabase
          .from('users')
          .select('id')
          .eq('referral_code', normalisedReferralCode)
          .maybeSingle();
        if (referrer && referrer.id !== supabaseUserId) {
          referredById = referrer.id;
          referralAccepted = true;
        }
      }

      // Single UPDATE — phone + referred_by together. Bonus is paid later
      // (by pay_referral_bonus RPC) once onboarding completes.
      await adminSupabase
        .from('users')
        .update({
          phone,
          ...(referredById ? { referred_by: referredById } : {}),
        })
        .eq('id', supabaseUserId);
    } else {
      // 3b. Returning user — get their Supabase auth record
      const { data: authUser, error: lookupErr } =
        await adminSupabase.auth.admin.getUserById(existingUser.id);

      if (lookupErr || !authUser.user) {
        console.error('[phone-signin] getUserById error:', lookupErr);
        return NextResponse.json({ error: 'Failed to locate account' }, { status: 500 });
      }

      supabaseUserId = authUser.user.id;
      userEmail = authUser.user.email ?? phantomEmail;
    }

    // 5. Generate a magic-link token so the client can establish a Supabase session
    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const { data: linkData, error: linkErr } = await adminSupabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
      options: { redirectTo: `${origin}/dashboard` },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error('[phone-signin] generateLink error:', linkErr);
      return NextResponse.json({ error: 'Failed to generate session link' }, { status: 500 });
    }

    // 6. Extract token_hash from properties (action_link uses 'token' param, not 'token_hash')
    const tokenHash = linkData.properties.hashed_token;
    const type = 'magiclink';

    if (!tokenHash) {
      return NextResponse.json({ error: 'Could not extract session token' }, { status: 500 });
    }

    after(async () => {
      try {
        if (isNewUser) {
          await notifyNewSignup(phantomEmail, phone);
        } else {
          const roles = (existingUser?.roles ?? []) as string[];
          const name = existingUser?.name ?? undefined;
          if (roles.includes('pandit')) {
            await notifyRoleLogin('pandit', phone, name);
          } else if (roles.includes('astrologer')) {
            await notifyRoleLogin('astrologer', phone, name);
          } else {
            await notifyUserLogin(phone, 'phone');
          }
        }
      } catch (notifyErr) {
        console.warn('[phone-signin] telegram notify failed', notifyErr);
      }
    });

    return NextResponse.json({ tokenHash, type, isNewUser, referralAccepted });
  } catch (err: unknown) {
    console.error('[phone-signin]', err);
    const message = (err as Error).message ?? 'Internal error';
    const status = message.includes('expired') || message.includes('invalid') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
