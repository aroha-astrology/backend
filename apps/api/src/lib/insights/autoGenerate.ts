import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueLiteJob, kickQueueDrain } from './enqueue';
import { enqueueJob } from '@/lib/queue';
import { ALL_PREDICTION_TYPES } from '@/lib/predictions/runPrediction';

// All feature surfaces that only need a birth chart (no extra user inputs)
const CHART_ONLY_FEATURES = [
  'dasha_widget',
  'summary_lite',
  'personality_lite',
  'career_lite',
  'marriage_lite',
  'health_lite',
  'spiritual_lite',
  'remedies_lite',
  'yearly_lite',
  'life_journey',
  'guna_chakra',
  // Auto-generated once per signup and on backfill via /api/cron/auto-generate.
  // mobile_numerology skips silently in the handler if users.phone is null.
  'name_correction',
  'mobile_numerology',
] as const;

/**
 * Schedule background AI generation for a newly created (or existing) chart.
 *
 * What this does:
 * 1. Enqueues lite AI jobs for all chart-only feature surfaces (free — no credits).
 *    These generate one NIM call each and write source='lite_ai' rows.
 * 2. Auto-creates a kundli_premium report in the background (free — no credits).
 *    The report process pipeline will then fan-out feature_enrich jobs once done,
 *    silently upgrading every screen to report_enriched quality.
 *
 * Call with fire-and-forget after returning the HTTP response — it's idempotent
 * and safe to call multiple times (enqueueLiteJob deduplicates via unique index).
 */
export async function scheduleAutoGeneration(
  supabase: SupabaseClient,
  params: {
    userId: string;
    chartId: string;
    language?: string;
  },
): Promise<void> {
  const { userId, chartId, language = 'en' } = params;

  // ── 1. Enqueue lite AI for all chart-only features ────────────────────────
  const liteResults = await Promise.allSettled(
    CHART_ONLY_FEATURES.map(featureKey =>
      enqueueLiteJob(supabase, { chartId, userId, featureKey, language }),
    ),
  );
  const liteCount = liteResults.filter(r => r.status === 'fulfilled' && r.value).length;
  console.log(`[autoGenerate] Enqueued ${liteCount}/${CHART_ONLY_FEATURES.length} lite jobs for chart ${chartId}`);

  // ── 2. Auto-generate premium report (free) ───────────────────────────────
  // Check existing premium report for this chart
  const { data: existing } = await supabase
    .from('generated_reports')
    .select('id, status')
    .eq('chart_id', chartId)
    .eq('report_type', 'kundli_premium')
    .in('status', ['pending', 'generating', 'ai_ready', 'completed'])
    .limit(1)
    .maybeSingle();

  if (!existing) {
    await autoTriggerPremiumReport(supabase, { userId, chartId, language });
  }

  // ── 3. Enqueue prediction generation for all types ───────────────────────
  const predResults = await Promise.allSettled(
    ALL_PREDICTION_TYPES.map(type =>
      enqueueJob(supabase, userId, 'prediction', { chart_id: chartId, type, language }),
    ),
  );
  const predCount = predResults.filter(r => r.status === 'fulfilled' && r.value).length;
  console.log(`[autoGenerate] Enqueued ${predCount}/${ALL_PREDICTION_TYPES.length} prediction jobs for chart ${chartId}`);

  // Kick drain so jobs start processing immediately
  kickQueueDrain();
}

async function autoTriggerPremiumReport(
  supabase: SupabaseClient,
  params: { userId: string; chartId: string; language: string },
): Promise<void> {
  const { userId, chartId, language } = params;

  // Fetch chart + profile for metadata
  const { data: chart } = await supabase
    .from('kundli_charts')
    .select('chart_data, dasha_data, yoga_data, dosha_data, shadbala, ashtakavarga, panchang_at_birth, birth_profiles(name, dob, tob, pob, gender)')
    .eq('id', chartId)
    .eq('user_id', userId)
    .single();

  if (!chart) return;

  const profile = Array.isArray(chart.birth_profiles)
    ? chart.birth_profiles[0] as Record<string, unknown>
    : chart.birth_profiles as Record<string, unknown> | null;

  if (!profile) return;

  const metadata: Record<string, unknown> = {
    chartData:    chart.chart_data,
    dashaData:    chart.dasha_data,
    yogaData:     chart.yoga_data,
    doshaData:    chart.dosha_data,
    shadbala:     chart.shadbala,
    ashtakavarga: chart.ashtakavarga,
    panchangAtBirth: chart.panchang_at_birth,
    profileData:  profile,
    language,
  };

  const { data: reportRow, error: insertErr } = await supabase
    .from('generated_reports')
    .insert({
      user_id:        userId,
      chart_id:       chartId,
      report_type:    'kundli_premium',
      subject_name:   String(profile.name ?? ''),
      subject_dob:    String(profile.dob ?? ''),
      subject_gender: String(profile.gender ?? ''),
      status:         'pending',
      metadata,
    })
    .select('id')
    .single();

  if (insertErr || !reportRow) {
    console.error('[autoGenerate] Failed to insert report row:', insertErr?.message);
    return;
  }

  // Kick the process endpoint (same pattern as /api/reports/generate)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const processKey = process.env.INTERNAL_PROCESS_KEY;
  if (!processKey) return;

  fetch(`${appUrl}/api/reports/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': processKey },
    body: JSON.stringify({ report_id: reportRow.id, user_id: userId }),
  }).catch(err => console.error('[autoGenerate] process kick failed:', err));

  console.log(`[autoGenerate] Auto-generated premium report ${reportRow.id} for chart ${chartId}`);
}
