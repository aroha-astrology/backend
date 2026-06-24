import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueLiteJob } from './enqueue';
import { buildDeterministicFallback } from './deterministicFallbacks';
import type { GroundTruthData } from '@/lib/ai/groundTruth';

export const SOURCE_VERSION = 1;

export interface InsightCtx {
  chartId: string;
  userId: string;
  language: string;
  paramsHash?: string;
  groundTruth?: GroundTruthData;
}

export interface UpsertParams {
  userId: string;
  chartId: string;
  featureKey: string;
  paramsHash: string;
  language: string;
  source: 'lite_ai' | 'report_enriched' | 'deterministic';
  content: Record<string, unknown>;
  reportId?: string | null;
  expiresAt?: string | null;
}

/**
 * Read a feature insight with cascading fallback:
 * 1. report_enriched row → best quality, return immediately
 * 2. lite_ai row → good quality, return immediately
 * 3. deterministic row (non-expired) → acceptable, return immediately
 * 4. Completed report exists → slice on the fly, write report_enriched, return
 * 5. No report → enqueue lite job (lazy), write deterministic row, return it
 */
export async function getFeatureInsight(
  supabase: SupabaseClient,
  featureKey: string,
  ctx: InsightCtx,
): Promise<Record<string, unknown>> {
  const { chartId, userId, language, paramsHash = '', groundTruth } = ctx;
  const now = new Date().toISOString();

  const { data: row } = await supabase
    .from('feature_insights')
    .select('source, content, expires_at')
    .eq('user_id', userId)
    .eq('chart_id', chartId)
    .eq('feature_key', featureKey)
    .eq('params_hash', paramsHash)
    .eq('language', language)
    .maybeSingle();

  if (row && (row.expires_at === null || row.expires_at > now)) {
    return row.content as Record<string, unknown>;
  }

  // Cache miss or expired deterministic — check for a completed report
  const { data: report } = await supabase
    .from('generated_reports')
    .select('id, ai_content')
    .eq('chart_id', chartId)
    .in('status', ['ai_ready', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (report?.ai_content) {
    const { REPORT_FIELDS_FOR_FEATURE } = await import('@/lib/ai/reportPrompts');
    const fields = REPORT_FIELDS_FOR_FEATURE[featureKey] ?? [];
    const sliced: Record<string, unknown> = {};
    for (const f of fields) {
      if (report.ai_content[f] !== undefined) sliced[f] = report.ai_content[f];
    }
    if (Object.keys(sliced).length > 0) {
      await upsertFeatureInsight(supabase, {
        userId, chartId, featureKey, paramsHash, language,
        source: 'report_enriched',
        content: sliced,
        reportId: report.id,
      });
      return sliced;
    }
  }

  // No report or fields missing — enqueue lite and return deterministic fallback
  await enqueueLiteJob(supabase, { chartId, userId, featureKey, language, paramsHash });

  const fallback = groundTruth
    ? buildDeterministicFallback(featureKey, groundTruth)
    : { status: 'Your personalised insight is being prepared — check back shortly.' };

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await upsertFeatureInsight(supabase, {
    userId, chartId, featureKey, paramsHash, language,
    source: 'deterministic',
    content: fallback,
    expiresAt,
  });

  return fallback;
}

/**
 * Conditional upsert via the Postgres SECURITY DEFINER function.
 * Precedence: report_enriched > lite_ai > deterministic.
 */
export async function upsertFeatureInsight(
  supabase: SupabaseClient,
  params: UpsertParams,
): Promise<void> {
  const { error } = await supabase.rpc('upsert_feature_insight', {
    p_user_id:        params.userId,
    p_chart_id:       params.chartId,
    p_feature_key:    params.featureKey,
    p_params_hash:    params.paramsHash,
    p_language:       params.language,
    p_source:         params.source,
    p_source_version: SOURCE_VERSION,
    p_content:        params.content,
    p_report_id:      params.reportId ?? null,
    p_expires_at:     params.expiresAt ?? null,
  });
  if (error) console.error('[cache] upsert_feature_insight failed', error);
}

/**
 * Delete all cached insights for a chart. Called when chart_data changes.
 * The 021 migration also wires this as an AFTER UPDATE trigger for safety.
 */
export async function invalidateChartInsights(
  supabase: SupabaseClient,
  chartId: string,
): Promise<void> {
  const { error } = await supabase
    .from('feature_insights')
    .delete()
    .eq('chart_id', chartId);
  if (error) console.error('[cache] invalidateChartInsights failed', error);
}
