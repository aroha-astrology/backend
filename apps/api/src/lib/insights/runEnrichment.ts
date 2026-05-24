import type { SupabaseClient } from '@supabase/supabase-js';
import { REPORT_FIELDS_FOR_FEATURE } from '@/lib/ai/reportPrompts';
import { upsertFeatureInsight } from './cache';

interface EnrichPayload {
  report_id: string;
  chart_id: string;
  feature_key: string;
  language: string;
  user_id: string;
}

/**
 * Slice ai_content from a completed report and write one feature_insights row
 * with source='report_enriched'. Idempotent — the conditional upsert prevents
 * downgrades; running twice on the same report just refreshes content.
 */
export async function runEnrichment(
  supabase: SupabaseClient,
  payload: EnrichPayload,
): Promise<{ ok: boolean; error?: string }> {
  const { report_id, chart_id, feature_key, language, user_id } = payload;

  const fields = REPORT_FIELDS_FOR_FEATURE[feature_key];
  if (!fields || fields.length === 0) {
    return { ok: false, error: `Unknown or unmapped feature_key: ${feature_key}` };
  }

  const { data: report, error: fetchErr } = await supabase
    .from('generated_reports')
    .select('ai_content, status')
    .eq('id', report_id)
    .single();

  if (fetchErr || !report) {
    return { ok: false, error: `Report not found: ${fetchErr?.message ?? 'null'}` };
  }

  if (!report.ai_content) {
    return { ok: false, error: 'Report has no ai_content yet' };
  }

  const content: Record<string, unknown> = {};
  for (const field of fields) {
    if (report.ai_content[field] !== undefined) {
      content[field] = report.ai_content[field];
    }
  }

  if (Object.keys(content).length === 0) {
    return { ok: false, error: `None of the expected fields found for ${feature_key} in report ${report_id}` };
  }

  await upsertFeatureInsight(supabase, {
    userId:     user_id,
    chartId:    chart_id,
    featureKey: feature_key,
    paramsHash: '',
    language,
    source:     'report_enriched',
    content,
    reportId:   report_id,
  });

  return { ok: true };
}
