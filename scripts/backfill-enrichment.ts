#!/usr/bin/env tsx
/**
 * One-shot backfill: for every completed/ai_ready report that has no
 * feature_insights enrichment rows yet, enqueue feature_enrich jobs.
 *
 * Usage:
 *   npx tsx scripts/backfill-enrichment.ts
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL from env
 * (or .env.local in the repo root).
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../apps/web/.env.local') });

import { createClient } from '@supabase/supabase-js';
import { FEATURES_FOR_TIER } from '../apps/web/src/lib/ai/reportPrompts';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log('Fetching completed reports…');

  const { data: reports, error } = await supabase
    .from('generated_reports')
    .select('id, chart_id, user_id, report_type, metadata')
    .in('status', ['ai_ready', 'completed'])
    .not('ai_content', 'is', null)
    .not('chart_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) { console.error('Fetch error:', error); process.exit(1); }
  if (!reports || reports.length === 0) { console.log('No completed reports found.'); return; }

  console.log(`Found ${reports.length} reports to backfill.`);

  // Check which reports already have enrichment queue rows
  const reportIds = reports.map(r => r.id);
  const { data: existingJobs } = await supabase
    .from('generation_queue')
    .select('payload')
    .eq('job_type', 'feature_enrich')
    .in('payload->>report_id', reportIds);

  const enrichedSet = new Set(
    (existingJobs ?? []).map(j => (j.payload as Record<string, string>).report_id),
  );

  const missing = reports.filter(r => !enrichedSet.has(r.id));
  console.log(`${missing.length} reports missing enrichment (${reports.length - missing.length} already have jobs).`);

  let total = 0;
  for (const report of missing) {
    const tier = String(report.report_type ?? '').includes('premium') ? 'premium'
      : String(report.report_type ?? '').includes('standard') ? 'standard'
      : 'basic';
    const features = FEATURES_FOR_TIER[tier] ?? FEATURES_FOR_TIER.basic;
    const language  = String((report.metadata as Record<string, unknown>)?.language ?? 'en');

    const rows = features.map(featureKey => ({
      user_id:  report.user_id,
      job_type: 'feature_enrich',
      payload:  { report_id: report.id, chart_id: report.chart_id, feature_key: featureKey, language, source_version: 1 },
      priority: 5,
      status:   'pending',
    }));

    const { data, error: insertErr } = await supabase
      .from('generation_queue')
      .upsert(rows, { onConflict: 'user_id,job_type,(payload->>\'chart_id\'),(payload->>\'feature_key\')', ignoreDuplicates: true })
      .select('id');

    if (insertErr) {
      console.warn(`  Report ${report.id}: insert error`, insertErr.message);
    } else {
      console.log(`  Report ${report.id} (${tier}): enqueued ${data?.length ?? 0}/${features.length} jobs`);
      total += data?.length ?? 0;
    }
  }

  console.log(`\nBackfill complete. ${total} enrichment jobs enqueued.`);
  console.log('Run the queue drain endpoint to process them:');
  console.log('  curl -X POST $APP_URL/api/queue/drain -H "x-internal-key: $INTERNAL_PROCESS_KEY"');
}

main().catch(err => { console.error(err); process.exit(1); });
