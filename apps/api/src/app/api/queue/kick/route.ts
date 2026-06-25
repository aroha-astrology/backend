import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { kickDrain } from '@/lib/queue/kick';

export const runtime = 'nodejs';

/**
 * POST /api/queue/kick — user-auth kick that fires a fire-and-forget request
 * at /api/queue/drain. Used by the client QueueProcessor when the app loads
 * so jobs that were left pending (e.g. user closed tab mid-drain) get picked
 * up immediately on return, without needing a Vercel cron.
 *
 * Cost is bounded: drainQueue is a no-op when the queue is empty (the first
 * claim returns null and the loop exits). Concurrent invocations are safe
 * via SKIP LOCKED.
 *
 * Auth is just "any logged-in user" — drain does not act on the caller's
 * identity, it processes whatever is pending across all users. Service-role
 * stays on the server.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  void kickDrain(request);
  return NextResponse.json({ success: true });
}
