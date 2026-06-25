// One-shot backfill: enqueue Name Correction + Mobile Numerology lite jobs for
// every existing user-chart that doesn't already have a feature_insights row.
//
// Mirrors /api/admin/backfill-lite but talks to Supabase directly, so it can
// run before that route is deployed. Re-runnable — the queue dedupe index
// drops duplicates and we skip users that already have a row.
//
// Run from apps/web: `node scripts/backfill-lite.mjs`

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
const internalKey = process.env.INTERNAL_PROCESS_KEY || '';
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const FEATURES = ['name_correction', 'mobile_numerology'];
const SOURCE_VERSION = 1;

const { data: rows, error } = await admin
  .from('kundli_charts')
  .select('id, user_id, users!inner(language, phone)')
  .order('created_at', { ascending: false });

if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}

const enqueued = { name_correction: 0, mobile_numerology: 0 };
const skipped = { already_has_row: 0, no_phone: 0, dedup_or_error: 0 };

for (const row of rows ?? []) {
  const chartId = row.id;
  const userId = row.user_id;
  const userRow = Array.isArray(row.users) ? row.users[0] : row.users;
  const language = userRow?.language ?? 'en';
  const phone = userRow?.phone ?? null;

  const { data: existing } = await admin
    .from('feature_insights')
    .select('feature_key')
    .eq('user_id', userId)
    .in('feature_key', FEATURES);
  const have = new Set((existing ?? []).map(r => r.feature_key));

  for (const featureKey of FEATURES) {
    if (have.has(featureKey)) { skipped.already_has_row++; continue; }
    if (featureKey === 'mobile_numerology' && !phone) { skipped.no_phone++; continue; }

    const { data, error: insErr } = await admin
      .from('generation_queue')
      .insert({
        user_id: userId,
        job_type: 'feature_lite',
        payload: {
          chart_id: chartId,
          feature_key: featureKey,
          language,
          params_hash: '',
          source_version: SOURCE_VERSION,
        },
        priority: -5,
        status: 'pending',
      })
      .select('id')
      .single();

    if (data) {
      enqueued[featureKey]++;
      console.log(`  + ${featureKey} → user=${userId.slice(0, 8)} chart=${chartId.slice(0, 8)}`);
    } else {
      skipped.dedup_or_error++;
      if (insErr && insErr.code !== '23505') {
        console.warn(`  ! ${featureKey} → ${insErr.code} ${insErr.message}`);
      }
    }
  }
}

console.log('\nResult:', JSON.stringify({ processed: rows?.length ?? 0, enqueued, skipped }, null, 2));

if (appUrl && internalKey) {
  try {
    const r = await fetch(`${appUrl}/api/queue/drain`, {
      method: 'POST',
      headers: { 'x-internal-key': internalKey },
    });
    console.log(`Kicked drain at ${appUrl}: ${r.status}`);
  } catch (e) {
    console.warn('Drain kick failed (will run on next cron tick):', e.message);
  }
} else {
  console.log('No NEXT_PUBLIC_APP_URL set — cron drain (every minute) will pick up the jobs.');
}
