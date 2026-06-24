import type { SupabaseClient } from '@supabase/supabase-js';
import { claimAnyJob, markJobFailed, type QueueJob } from './index';
import { runJob } from './handlers';
import { runReconciler } from '@/lib/insights/reconciler';
import { notifyBackendError } from '@/lib/telegram';

const SLOTS = 3;
const TIME_BUDGET_MS = 270_000;
const MAX_JOBS_PER_INVOCATION = 20;

interface DrainStats {
  processed: number;
  succeeded: number;
  failed: number;
  emptyClaims: number;
  durationMs: number;
}

/**
 * Drain the generation_queue with bounded concurrency. Caller passes a
 * service-role client so claim_any_pending_job() and update RLS bypass work.
 *
 * Stops when:
 * - the queue returns empty (no pending jobs left for now), OR
 * - wall-clock exceeds TIME_BUDGET_MS (Vercel function ceiling minus margin), OR
 * - MAX_JOBS_PER_INVOCATION is reached (one cron tick shouldn't monopolise).
 *
 * Multiple concurrent invocations are safe — claim_any_pending_job uses
 * SKIP LOCKED so two workers never get the same row.
 */
export async function drainQueue(admin: SupabaseClient): Promise<DrainStats> {
  const start = Date.now();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let emptyClaims = 0;

  while (
    Date.now() - start < TIME_BUDGET_MS
    && processed < MAX_JOBS_PER_INVOCATION
  ) {
    const remaining = MAX_JOBS_PER_INVOCATION - processed;
    const batchSize = Math.min(SLOTS, remaining);

    const claimed = await Promise.all(
      Array.from({ length: batchSize }, () => claimAnyJob(admin)),
    );
    const jobs = claimed.filter((j): j is QueueJob => j !== null);

    if (jobs.length === 0) {
      emptyClaims += 1;
      break;
    }

    const results = await Promise.allSettled(jobs.map((job) => runJob(admin, job)));

    await Promise.all(results.map(async (r, i) => {
      const job = jobs[i];
      if (r.status === 'fulfilled' && r.value.ok) {
        succeeded += 1;
        await admin
          .from('generation_queue')
          .update({ status: 'done', completed_at: new Date().toISOString() })
          .eq('id', job.id);
      } else {
        failed += 1;
        let reason: string;
        if (r.status === 'fulfilled') {
          // Narrowed: ok must be false here since the if branch above caught ok=true
          reason = r.value.ok ? 'unknown' : r.value.reason;
        } else {
          reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
        }
        await markJobFailed(admin, job.id, reason);
        notifyBackendError(
          `queue/${job.job_type} (user=${job.user_id})`,
          new Error(reason),
        );
      }
    }));

    processed += jobs.length;
  }

  // Safety-net: re-enqueue enrichment for any ai_ready reports that missed fan-out
  await runReconciler(admin).catch(err =>
    console.warn('[drain] reconciler error (non-fatal):', err),
  );

  return {
    processed,
    succeeded,
    failed,
    emptyClaims,
    durationMs: Date.now() - start,
  };
}
