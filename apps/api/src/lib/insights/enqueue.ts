import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueJob } from '@/lib/queue/index';
import type { JobType } from '@/lib/queue/index';

const LITE_DAILY_CAP = 30;
const SOURCE_VERSION = 1;

export interface EnrichmentParams {
  reportId: string;
  chartId: string;
  userId: string;
  language: string;
  features: string[];
}

/**
 * Fan-out: enqueue one feature_enrich job per feature after a report reaches
 * ai_ready. Each feature is its own queue row — failures are independent and
 * the reconciler handles re-enqueue after worker crashes.
 */
export async function enqueueEnrichmentJobs(
  supabase: SupabaseClient,
  params: EnrichmentParams,
): Promise<number> {
  const { reportId, chartId, userId, language, features } = params;
  let enqueued = 0;
  for (const featureKey of features) {
    const job = await enqueueJob(
      supabase,
      userId,
      'feature_enrich' as JobType,
      { report_id: reportId, chart_id: chartId, feature_key: featureKey, language, source_version: SOURCE_VERSION },
      5,
    );
    if (job) enqueued++;
  }
  return enqueued;
}

/**
 * Lazy-on-first-view: enqueue a feature_lite job for a cache-miss feature.
 * Enforces a 30-calls/user/day cap to control NIM cost.
 * Returns false if the cap is hit or a job already exists.
 */
export async function enqueueLiteJob(
  supabase: SupabaseClient,
  params: {
    chartId: string;
    userId: string;
    featureKey: string;
    language: string;
    paramsHash?: string;
    /** Override queue priority (default 3). Use a lower number to push the job behind
     *  higher-priority work in the same drain pass (e.g. -5 for tail-end lite features). */
    priority?: number;
  },
): Promise<boolean> {
  const { chartId, userId, featureKey, language, paramsHash = '', priority = 3 } = params;

  const today = new Date().toISOString().slice(0, 10);
  const { count } = await supabase
    .from('generation_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('job_type', 'feature_lite')
    .gte('created_at', `${today}T00:00:00Z`);

  if ((count ?? 0) >= LITE_DAILY_CAP) {
    console.warn(`[enqueue] Lite cap reached for user ${userId}`);
    return false;
  }

  const job = await enqueueJob(
    supabase,
    userId,
    'feature_lite' as JobType,
    { chart_id: chartId, feature_key: featureKey, language, params_hash: paramsHash, source_version: SOURCE_VERSION },
    priority,
  );
  return job !== null;
}

/**
 * Kick the drain endpoint fire-and-forget so the worker picks up new jobs
 * without waiting for the next cron tick.
 */
export function kickQueueDrain(): void {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const key = process.env.INTERNAL_PROCESS_KEY;
  if (!key) return;
  fetch(`${appUrl}/api/queue/drain`, {
    method: 'POST',
    headers: { 'x-internal-key': key },
  }).catch(() => { /* fire-and-forget */ });
}
