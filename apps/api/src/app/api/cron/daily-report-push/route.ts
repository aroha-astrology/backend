export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push/send';
import { todayIST } from '@/lib/horoscope/generate';

// Fans out a 7 AM IST push to every user who has today's From-Astrologer reading
// cached in feature_insights. The prior night's `from-astrologer-daily` cron wrote
// the row with params_hash = tomorrowISO(); from this cron's perspective that key
// is now todayIST(). sendPushToUser silently no-ops for users without an active
// push_subscriptions row, so we don't need a separate join.

const PAGE_SIZE = 50;

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
  const batchSize = Math.min(Number(searchParams.get('batchSize') ?? PAGE_SIZE), 200);
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);
  const today = todayIST();

  const admin = createAdminSupabase();

  const { data: rows, error } = await admin
    .from('feature_insights')
    .select('user_id')
    .eq('feature_key', 'from_astrologer_daily')
    .eq('params_hash', today)
    .order('user_id', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) {
    console.error('[cron/daily-report-push] query failed:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // A user may have rows in multiple languages — dedupe so we push once.
  const userIds = Array.from(new Set((rows ?? []).map(r => r.user_id as string)));

  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      await sendPushToUser(userId, {
        title: 'Your reading for today is ready',
        body: 'Open Aroha Astrology for a fresh card from your astrologer.',
        url: '/dashboard',
        route: '/dashboard',
        tag: `daily-report-${today}`,
      });
      sent++;
    } catch (err) {
      console.error('[cron/daily-report-push] send failed for user', userId, err);
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    date: today,
    processed: rows?.length ?? 0,
    uniqueUsers: userIds.length,
    sent,
    failed,
    nextOffset: (rows?.length ?? 0) === batchSize ? offset + batchSize : null,
  });
}

export const GET = handle;
export const POST = handle;
