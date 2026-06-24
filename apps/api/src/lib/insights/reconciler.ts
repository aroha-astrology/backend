import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueEnrichmentJobs } from './enqueue';
import { FEATURES_FOR_TIER } from '@/lib/ai/reportPrompts';

const STALE_THRESHOLD_SEC = 60;

/**
 * Safety-net: scan for reports that reached ai_ready/completed but have no
 * corresponding feature_insights enrichment rows yet.
 * This catches the case where /api/reports/process completed the AI write
 * but crashed before the enqueueEnrichmentJobs call landed.
 *
 * Idempotent — the unique key on feature_insights + job deduplication in
 * enqueueJob (23505 unique_violation → silent skip) prevent double-writes.
 */
export async function runReconciler(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_SEC * 1000).toISOString();

  // Find reports that completed >60s ago but have zero enrichment rows
  const { data: stale, error } = await supabase
    .from('generated_reports')
    .select('id, chart_id, user_id, report_type, metadata')
    .in('status', ['ai_ready', 'completed'])
    .lt('updated_at', cutoff)
    .not('ai_content', 'is', null)
    .not('chart_id', 'is', null)
    .limit(10);

  if (error || !stale || stale.length === 0) return 0;

  // Filter to only those missing enrichment jobs
  const staleIds = stale.map(r => r.id);
  const { data: existing } = await supabase
    .from('generation_queue')
    .select('payload')
    .eq('job_type', 'feature_enrich')
    .in('payload->>report_id', staleIds);

  const enrichedReportIds = new Set(
    (existing ?? []).map(row => (row.payload as Record<string, string>).report_id),
  );

  const missing = stale.filter(r => !enrichedReportIds.has(r.id));

  let count = 0;
  for (const report of missing) {
    const tier = tierFromReportType(String(report.report_type ?? ''));
    const features = FEATURES_FOR_TIER[tier] ?? FEATURES_FOR_TIER.basic;
    const language = String((report.metadata as Record<string, unknown>)?.language ?? 'en');

    const enqueued = await enqueueEnrichmentJobs(supabase, {
      reportId:  report.id,
      chartId:   report.chart_id,
      userId:    report.user_id,
      language,
      features,
    });
    if (enqueued > 0) count++;
  }

  if (count > 0) console.log(`[reconciler] Re-enqueued enrichment for ${count} stale report(s)`);
  return count;
}

function tierFromReportType(reportType: string): string {
  if (reportType.includes('premium')) return 'premium';
  if (reportType.includes('standard')) return 'standard';
  return 'basic';
}
