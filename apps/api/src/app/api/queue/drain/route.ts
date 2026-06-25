import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { drainQueue } from '@/lib/queue/drain';
import { notifyBackendError } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST/GET /api/queue/drain — server-side queue drainer.
 *
 * Two callers, two auth styles (mirroring conventions already in the codebase):
 *   1. Vercel cron (GET, every minute) — Authorization: Bearer ${CRON_SECRET}
 *      Same pattern as /api/cron/horoscope.
 *   2. On-demand kick from enqueue routes (POST, fire-and-forget) —
 *      x-internal-key: ${INTERNAL_PROCESS_KEY}
 *      Same pattern as /api/divisional-charts/auto-generate, /api/reports/render.
 *
 * Multiple concurrent invocations are safe (SKIP LOCKED in claim_any_pending_job).
 * Closing the user's tab no longer stalls jobs — that was the whole point.
 */
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const internalKey = process.env.INTERNAL_PROCESS_KEY;

  const auth = request.headers.get('authorization');
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const xKey = request.headers.get('x-internal-key');
  if (internalKey && xKey === internalKey) return true;

  return false;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminSupabase();
    const stats = await drainQueue(admin);
    console.log('[queue/drain]', stats);
    return NextResponse.json({ success: true, ...stats });
  } catch (err) {
    console.error('[queue/drain]', err);
    notifyBackendError('/api/queue/drain', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
