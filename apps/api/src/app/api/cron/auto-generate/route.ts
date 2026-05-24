export const runtime = 'nodejs';
export const maxDuration = 300; // 5-minute budget

import { NextRequest, NextResponse } from 'next/server';
import { runBackgroundGeneration } from '@/lib/insights/backgroundGenerate';

function isAuthorized(req: NextRequest): boolean {
  const cronSecret  = process.env.CRON_SECRET;
  const internalKey = process.env.INTERNAL_PROCESS_KEY;
  const auth = req.headers.get('authorization');
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const xKey = req.headers.get('x-internal-key');
  if (internalKey && xKey === internalKey) return true;
  return false;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const batchSize = Math.min(Number(searchParams.get('batch') ?? 15), 30);
  const offset    = Number(searchParams.get('offset') ?? 0);

  console.log(`[auto-generate cron] Starting — batch:${batchSize} offset:${offset}`);

  const result = await runBackgroundGeneration(batchSize, offset);

  return NextResponse.json({ success: true, ...result });
}

export const GET  = handle;
export const POST = handle;
