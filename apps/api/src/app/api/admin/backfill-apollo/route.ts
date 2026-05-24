export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { enrichUserFromApolloIfNeeded } from '@/lib/apollo';

/**
 * One-time / re-runnable backfill: runs Apollo enrichment for all users that
 * have never been enriched (apollo_enriched_at IS NULL).
 *
 * Paginate with ?offset=N to walk through all users.
 * Serial calls to stay within Apollo rate limits.
 *
 * Auth: logged-in admin session (is_admin=true on users table).
 */

const PAGE_SIZE = 20;

async function isAuthorized(): Promise<boolean> {
  try {
    const userSupabase = await createServerSupabase();
    const { data: { user } } = await userSupabase.auth.getUser();
    if (!user) return false;
    const { data } = await userSupabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    return !!data?.is_admin;
  } catch {
    return false;
  }
}

async function handle(req: NextRequest) {
  if (!(await isAuthorized())) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const batchSize = Math.min(Number(searchParams.get('batchSize') ?? PAGE_SIZE), 50);
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);

  const admin = createAdminSupabase();

  const { data: rows, error } = await admin
    .from('users')
    .select('id, email, name')
    .is('apollo_enriched_at', null)
    .not('email', 'is', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) {
    console.error('[admin/backfill-apollo] query failed:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  let enriched = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const user = row as { id: string; email: string; name: string | null };
    if (!user.email) { skipped++; continue; }

    try {
      await enrichUserFromApolloIfNeeded({
        userId: user.id,
        email: user.email,
        name: user.name,
      });
      enriched++;
    } catch (err) {
      console.error('[admin/backfill-apollo] failed for', user.id, err);
      failed++;
    }

    // Small delay between Apollo calls to avoid rate-limit bursts.
    await new Promise(r => setTimeout(r, 400));
  }

  const nextOffset = (rows?.length ?? 0) === batchSize ? offset + batchSize : null;

  return NextResponse.json({
    success: true,
    processed: rows?.length ?? 0,
    enriched,
    skipped,
    failed,
    nextOffset,
  });
}

export const GET = handle;
export const POST = handle;
