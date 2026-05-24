export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { enrichUserFromApolloIfNeeded } from '@/lib/apollo';

/**
 * Lazy backfill endpoint. The dashboard fires this once per session for any
 * authenticated user whose apollo_enriched_at is still null. Idempotent —
 * enrichUserFromApolloIfNeeded short-circuits if the user is already enriched.
 *
 * Auth: session cookie (this is user-initiated, not internal-key). The endpoint
 * does no work for the wrong user — it always operates on the caller's own id.
 */
export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.email) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Skip if already enriched — no Apollo call, no DB write.
  const { data: row } = await supabase
    .from('users')
    .select('apollo_enriched_at, name')
    .eq('id', user.id)
    .maybeSingle();

  if (row?.apollo_enriched_at) {
    return NextResponse.json({ success: true, status: 'already_enriched' });
  }

  try {
    await enrichUserFromApolloIfNeeded({
      userId: user.id,
      email: user.email,
      name:
        (row?.name as string | undefined) ??
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        null,
    });
    return NextResponse.json({ success: true, status: 'enriched' });
  } catch (err) {
    console.warn('[api/internal/apollo-enrich] failed', err);
    return NextResponse.json({ success: false, error: 'Enrichment failed' }, { status: 500 });
  }
}
