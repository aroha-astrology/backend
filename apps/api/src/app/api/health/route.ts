import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const start = Date.now();
  let dbOk = false;
  let dbLatencyMs: number | null = null;

  try {
    const admin = createAdminSupabase();
    const t = Date.now();
    const { error } = await admin.from('users').select('id', { count: 'exact', head: true }).limit(1);
    dbLatencyMs = Date.now() - t;
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  const ok = dbOk;
  return NextResponse.json(
    {
      ok,
      uptime: process.uptime(),
      checks: {
        db: { ok: dbOk, latencyMs: dbLatencyMs },
      },
      tookMs: Date.now() - start,
      ts: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
