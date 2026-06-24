export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { generateFromAstrologerDaily } from '@/lib/astrologer/fromAstrologerGenerate';

/**
 * Nightly generation of tomorrow's "From Astrologer" card for every user whose
 * Apollo enrichment has both completed AND passed its 2-hour reveal window.
 *
 * Iterates in pages so we don't blow memory on big tables. Generates serially
 * because the NIM endpoint 429s under parallel load.
 */

const PAGE_SIZE = 25;

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  const xKey = req.headers.get('x-internal-key');
  if (process.env.INTERNAL_PROCESS_KEY && xKey === process.env.INTERNAL_PROCESS_KEY) return true;
  return false;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const batchSize = Math.min(Number(searchParams.get('batchSize') ?? PAGE_SIZE), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);
  const language = searchParams.get('language') ?? 'en';

  const admin = createAdminSupabase();

  // Eligible users: enrichment derived + reveal window has passed. Inner join to
  // their primary chart (no chart → nothing to generate against).
  const { data: rows, error } = await admin
    .from('users')
    .select('id, kundli_charts!inner(id)')
    .not('apollo_derived_at', 'is', null)
    .lt('apollo_reveal_at', new Date().toISOString())
    .order('id', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) {
    console.error('[cron/from-astrologer-daily] query failed:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  let generated = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const charts = (row as { kundli_charts: { id: string }[] | { id: string } | null }).kundli_charts;
    const chartId = Array.isArray(charts) ? charts[0]?.id : charts?.id;
    if (!chartId) continue;

    try {
      const reading = await generateFromAstrologerDaily(admin, {
        userId: (row as { id: string }).id,
        chartId,
        language,
      });
      if (reading) generated++;
      else failed++;
    } catch (err) {
      console.error('[cron/from-astrologer-daily] gen failed for user', (row as { id: string }).id, err);
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    processed: rows?.length ?? 0,
    generated,
    failed,
    nextOffset: (rows?.length ?? 0) === batchSize ? offset + batchSize : null,
  });
}

export const GET = handle;
export const POST = handle;
