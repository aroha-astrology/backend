import type { SupabaseClient } from '@supabase/supabase-js';

export type JobType = 'life_journey_phase' | 'horoscope_daily' | 'numerology' | 'kundli_insights' | 'palm_reading' | 'feature_enrich' | 'feature_lite' | 'prediction';

export interface QueueJob {
  id: string;
  user_id: string;
  job_type: JobType;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'skipped';
  priority: number;
  attempts: number;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * Insert a pending job. Idempotent — the unique partial index on
 * (user_id, job_type, chart_id, phase_index) WHERE status IN ('pending','processing')
 * ensures the same job can't be queued twice while one is still open.
 */
export async function enqueueJob(
  supabase: SupabaseClient,
  userId: string,
  jobType: JobType,
  payload: Record<string, unknown>,
  priority = 0,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('generation_queue')
    .insert({ user_id: userId, job_type: jobType, payload, priority, status: 'pending' })
    .select('id')
    .single();

  if (error) {
    // 23505 = unique_violation — already queued, that's fine
    if ((error as { code?: string }).code === '23505') return null;
    console.error('[queue] enqueue failed', error);
    return null;
  }
  return data;
}

/**
 * Mark any open (pending/processing) jobs matching the payload signature as
 * 'done'. Called by feature endpoints when the user manually triggers
 * generation, so we don't double-generate.
 */
export async function markJobsDone(
  supabase: SupabaseClient,
  userId: string,
  jobType: JobType,
  payloadMatch: { chart_id?: string; phase_index?: number },
): Promise<void> {
  let q = supabase
    .from('generation_queue')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('job_type', jobType)
    .in('status', ['pending', 'processing']);

  if (payloadMatch.chart_id !== undefined) q = q.eq('payload->>chart_id', payloadMatch.chart_id);
  if (payloadMatch.phase_index !== undefined) q = q.eq('payload->>phase_index', String(payloadMatch.phase_index));

  const { error } = await q;
  if (error) console.error('[queue] markJobsDone failed', error);
}

/**
 * Mark a single job as failed with an error message. Caller decides whether to
 * retry (by re-enqueueing) or leave failed.
 */
export async function markJobFailed(
  supabase: SupabaseClient,
  jobId: string,
  errMessage: string,
): Promise<void> {
  await supabase
    .from('generation_queue')
    .update({ status: 'failed', last_error: errMessage.slice(0, 500), completed_at: new Date().toISOString() })
    .eq('id', jobId);
}

/**
 * Atomically claim the next pending job for a user. Uses a SECURITY DEFINER
 * Postgres function with SKIP LOCKED so concurrent workers never claim the
 * same row.
 */
export async function claimNextJob(
  supabase: SupabaseClient,
  userId: string,
): Promise<QueueJob | null> {
  const { data, error } = await supabase
    .rpc('claim_next_queue_job', { p_user_id: userId });
  if (error) {
    console.error('[queue] claim failed', error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0] as QueueJob;
}

/**
 * Atomically claim the next pending job across all users. Service-role only —
 * used by the server-side drainer (apps/web/src/app/api/queue/drain/route.ts)
 * and by Vercel cron. SKIP LOCKED makes this safe under concurrent invocations.
 */
export async function claimAnyJob(supabase: SupabaseClient): Promise<QueueJob | null> {
  const { data, error } = await supabase.rpc('claim_any_pending_job');
  if (error) {
    console.error('[queue] claimAny failed', error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0] as QueueJob;
}

/**
 * Enqueue all life-journey phase jobs for a freshly generated chart.
 * One job per phase index up to maxPhases (default 7 — covers most lifetimes).
 */
export async function enqueueLifeJourneyPhases(
  supabase: SupabaseClient,
  userId: string,
  chartId: string,
  totalPhases: number,
): Promise<number> {
  const rows = Array.from({ length: Math.min(totalPhases, 7) }, (_, i) => ({
    user_id: userId,
    job_type: 'life_journey_phase' as JobType,
    payload: { chart_id: chartId, phase_index: i },
    priority: 7 - i, // earlier phases first
    status: 'pending',
  }));
  const { data } = await supabase
    .from('generation_queue')
    .upsert(rows, {
      onConflict: 'user_id,job_type,(COALESCE(payload->>\'chart_id\',\'\')),(COALESCE(payload->>\'phase_index\',\'\'))',
      ignoreDuplicates: true,
    })
    .select('id');
  return data?.length ?? 0;
}
