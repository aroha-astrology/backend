// One-shot: how many user-charts need backfill, broken down by what's missing.
// Run from apps/web: `node scripts/count-backfill-targets.mjs`
// Reads from .env.local — service role, bypasses RLS.

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { count: chartCount } = await admin
  .from('kundli_charts')
  .select('id', { count: 'exact', head: true });

const { count: ncRows } = await admin
  .from('feature_insights')
  .select('id', { count: 'exact', head: true })
  .eq('feature_key', 'name_correction');

const { count: mnRows } = await admin
  .from('feature_insights')
  .select('id', { count: 'exact', head: true })
  .eq('feature_key', 'mobile_numerology');

const { count: usersWithPhone } = await admin
  .from('users')
  .select('id', { count: 'exact', head: true })
  .not('phone', 'is', null);

const { count: pendingJobs } = await admin
  .from('generation_queue')
  .select('id', { count: 'exact', head: true })
  .eq('job_type', 'feature_lite')
  .in('status', ['pending', 'processing']);

console.log(JSON.stringify({
  total_kundli_charts: chartCount,
  users_with_phone: usersWithPhone,
  existing_name_correction_rows: ncRows,
  existing_mobile_numerology_rows: mnRows,
  open_feature_lite_jobs: pendingJobs,
}, null, 2));
