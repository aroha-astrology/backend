import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: rows, error } = await supabase
  .from('divisional_chart_analyses')
  .select('status, chart_type, error_message');
if (error) { console.error(error); process.exit(1); }

const byStatus = {};
const errorsByType = {};
const errorSamples = [];
for (const r of rows ?? []) {
  byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  if (r.status === 'error') {
    errorsByType[r.chart_type] = (errorsByType[r.chart_type] ?? 0) + 1;
    if (errorSamples.length < 3) errorSamples.push({ chart_type: r.chart_type, error_message: r.error_message });
  }
}

console.log(`Total rows: ${rows?.length ?? 0}`);
console.log('By status:', byStatus);
if (Object.keys(errorsByType).length > 0) {
  console.log('Errors by chart_type:', errorsByType);
  console.log('Sample errors:', errorSamples);
}

const { count: kCount } = await supabase
  .from('kundli_charts')
  .select('id', { count: 'exact', head: true })
  .not('divisional_charts', 'is', null);
console.log(`Kundli charts with divisional_charts: ${kCount} → expected ${kCount * 16} = ${kCount} × 16 vargas`);
