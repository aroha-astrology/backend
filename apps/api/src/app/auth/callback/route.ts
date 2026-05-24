import { after, NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { notifyUserLogin, notifyNewSignup } from '@/lib/telegram';
import { enrichUserFromApolloIfNeeded } from '@/lib/apollo';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Sync name + email from OAuth metadata (covers Google OAuth where the
      // trigger may have stored an empty name on the first insert)
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let isNewUser = false;

      if (user) {
        const oauthName =
          (user.user_metadata?.full_name as string | undefined)?.trim() ||
          (user.user_metadata?.name as string | undefined)?.trim() ||
          '';

        // Fetch current name from DB — only update if it is blank/empty
        const { data: existingRow } = await supabase
          .from('users')
          .select('name')
          .eq('id', user.id)
          .single();

        isNewUser = !existingRow?.name?.trim();

        if (isNewUser) {
          // Name is blank — write the OAuth name (fall back to email prefix)
          const nameToSet = oauthName || (user.email?.split('@')[0] ?? '');
          if (nameToSet) {
            await supabase
              .from('users')
              .update({ name: nameToSet, email: user.email })
              .eq('id', user.id);
          }
          if (user.email) {
            await notifyNewSignup(user.email, oauthName || user.email.split('@')[0]);
          }
        } else if (user.email && !existingRow) {
          // Row doesn't exist yet — upsert with email at minimum
          await supabase
            .from('users')
            .upsert({ id: user.id, email: user.email, name: oauthName || user.email.split('@')[0] });
          await notifyNewSignup(user.email, oauthName || user.email.split('@')[0]);
        } else if (user.email) {
          await notifyUserLogin(user.email, 'google');
        }
      }

      // Best-effort Apollo enrichment — runs after the redirect response is
      // sent so login latency is unaffected. Idempotent: re-runs only if the
      // user has no apollo_enriched_at yet.
      if (user?.email) {
        const userId = user.id;
        const userEmail = user.email;
        const userName =
          (user.user_metadata?.full_name as string | undefined)?.trim() ||
          (user.user_metadata?.name as string | undefined)?.trim() ||
          null;
        after(async () => {
          try {
            await enrichUserFromApolloIfNeeded({ userId, email: userEmail, name: userName });
          } catch (err) {
            console.warn('[auth/callback] apollo enrichment failed', err);
          }
        });
      }

      // Send new users to onboarding to collect birth details
      const finalDest = isNewUser ? '/onboarding' : next;
      return NextResponse.redirect(`${origin}${finalDest}`);
    }
  }

  // Code exchange failed (deleted user, expired code, PKCE mismatch, etc.)
  // Clear all stale Supabase auth cookies so the next login starts clean
  // instead of looping back here on the same dead session.
  const failResponse = NextResponse.redirect(`${origin}/login?error=auth_failed`);
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith('sb-') && c.name.includes('auth-token')) {
      failResponse.cookies.delete(c.name);
    }
  }
  return failResponse;
}
