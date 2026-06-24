import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Open feature_lite jobs for the two features we backfilled
const { data: jobs } = await admin
  .from('generation_queue')
  .select('id, user_id, status, priority, attempts, last_error, created_at, started_at, completed_at, payload')
  .eq('job_type', 'feature_lite')
  .or('payload->>feature_key.eq.name_correction,payload->>feature_key.eq.mobile_numerology')
  .order('created_at', { ascending: false })
  .limit(20);

const byStatus = {};
for (const j of jobs ?? []) {
  byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
}

const { count: ncRows } = await admin
  .from('feature_insights')
  .select('id', { count: 'exact', head: true })
  .eq('feature_key', 'name_correction');
const { count: mnRows } = await admin
  .from('feature_insights')
  .select('id', { count: 'exact', head: true })
  .eq('feature_key', 'mobile_numerology');

console.log('feature_lite jobs (name_correction + mobile_numerology) by status:', byStatus);
console.log('Insight rows:', { name_correction: ncRows, mobile_numerology: mnRows });
console.log('\nMost recent 10 jobs:');
for (const j of (jobs ?? []).slice(0, 10)) {
  const fk = j.payload?.feature_key;
  const age = Math.round((Date.now() - new Date(j.created_at).getTime()) / 1000);
  console.log(`  [${j.status.padEnd(10)}] ${fk?.padEnd(20)} attempts=${j.attempts} age=${age}s ${j.last_error ? `err="${j.last_error.slice(0, 80)}"` : ''}`);
}
