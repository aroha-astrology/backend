export const runtime = 'nodejs';
export const maxDuration = 300; // 5-minute budget per call

import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { enqueueJob, type JobType } from '@/lib/queue/index';
import { kickDrain } from '@/lib/queue/kick';

/**
 * Re-runnable backfill: enqueues Name Correction + Mobile Numerology lite jobs
 * for every existing user with a chart that doesn't already have an insight
 * row. Pre-onboarding-enqueue users (signed up before commit 94a2c9a) never
 * had these jobs queued — this fills the gap.
 *
 * Idempotent. Re-running is safe:
 *   1. We skip enqueue if a feature_insights row already exists.
 *   2. The generation_queue dedupe unique index drops duplicate pending jobs
 *      silently (enqueueJob already swallows the 23505).
 *
 * Mobile Numerology is skipped for users with no users.phone — the handler
 * would skip anyway, and we'd rather not burn queue slots.
 *
 * Auth: any of (mirrors the cron-style routes already in the codebase):
 *   - Authorization: Bearer ${CRON_SECRET}
 *   - x-internal-key: ${INTERNAL_PROCESS_KEY}
 *   - logged-in admin session (users.is_admin = true)
 *
 * Pagination: ?batchSize=N&offset=M. If the response includes nextOffset,
 * call again with that offset. Default batchSize=200; the work per user is
 * a couple of SELECTs and at most 2 INSERTs, so 200 fits comfortably under
 * the 5-minute budget.
 */

const DEFAULT_BATCH = 200;
const MAX_BATCH = 500;
const SOURCE_VERSION = 1;
const FEATURES = ['name_correction', 'mobile_numerology'] as const;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const internalKey = process.env.INTERNAL_PROCESS_KEY;

  const auth = req.headers.get('authorization');
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const xKey = req.headers.get('x-internal-key');
  if (internalKey && xKey === internalKey) return true;

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
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const batchSize = Math.min(Number(searchParams.get('batchSize') ?? DEFAULT_BATCH), MAX_BATCH);
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);

  const admin = createAdminSupabase();

  // Walk users with charts, newest-first. We rely on offset rather than a
  // last_id cursor because users.created_at is stable and we tolerate the
  // (tiny) chance of a new signup shifting offsets mid-run.
  const { data: rows, error } = await admin
    .from('kundli_charts')
    .select('id, user_id, users!inner(language, phone)')
    .order('created_at', { ascending: false })
    .range(offset, offset + batchSize - 1);

  if (error) {
    console.error('[admin/backfill-lite] query failed:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const enqueuedCounts: Record<string, number> = { name_correction: 0, mobile_numerology: 0 };
  const skippedCounts: Record<string, number> = {
    already_has_row: 0,
    no_phone: 0,
    dedup_or_error: 0,
  };

  for (const row of rows ?? []) {
    const chartId = row.id as string;
    const userId = row.user_id as string;
    const userRow = Array.isArray(row.users) ? row.users[0] : row.users;
    const language = (userRow as { language?: string } | null)?.language ?? 'en';
    const phone = (userRow as { phone?: string | null } | null)?.phone ?? null;

    // One SELECT covers both features; we then group in memory.
    const { data: existing } = await admin
      .from('feature_insights')
      .select('feature_key')
      .eq('user_id', userId)
      .in('feature_key', FEATURES as unknown as string[]);
    const have = new Set((existing ?? []).map(r => r.feature_key as string));

    for (const featureKey of FEATURES) {
      if (have.has(featureKey)) { skippedCounts.already_has_row++; continue; }
      if (featureKey === 'mobile_numerology' && !phone) { skippedCounts.no_phone++; continue; }

      const job = await enqueueJob(
        admin,
        userId,
        'feature_lite' as JobType,
        {
          chart_id: chartId,
          feature_key: featureKey,
          language,
          params_hash: '',
          source_version: SOURCE_VERSION,
        },
        -5, // tail-end priority, same as onboarding
      );
      if (job) enqueuedCounts[featureKey]++;
      else skippedCounts.dedup_or_error++;
    }
  }

  // Best-effort kick. Cron drains every minute, so this just makes things
  // start sooner — never let a kick failure poison the response.
  try { await kickDrain(req); } catch { /* ignore */ }

  const processed = rows?.length ?? 0;
  const nextOffset = processed === batchSize ? offset + batchSize : null;

  return NextResponse.json({
    success: true,
    processed,
    enqueued: enqueuedCounts,
    skipped: skippedCounts,
    nextOffset,
  });
}

export const GET = handle;
export const POST = handle;
