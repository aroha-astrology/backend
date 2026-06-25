// READ-ONLY inventory of all AI-generated content for one user.
// Use this BEFORE running any regen script so we know the actual scope.
//
// Usage:
//   node --env-file=apps/web/.env.local apps/web/scripts/inventory-user-ai.mjs --phone=+919535960988
//   node --env-file=apps/web/.env.local apps/web/scripts/inventory-user-ai.mjs --user=<uuid>

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flagVal = (name) => {
  const a = args.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return undefined;
  const i = a.indexOf('=');
  return i >= 0 ? a.slice(i + 1) : true;
};

const phone = flagVal('phone');
const userIdArg = flagVal('user');
if (!phone && !userIdArg) {
  console.error('Pass --phone=+91... or --user=<uuid>');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── 1. Resolve user ──────────────────────────────────────────────────────────
let userId = userIdArg;
let userRow;
if (phone) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, phone, credits, is_admin, is_premium, created_at')
    .eq('phone', phone)
    .maybeSingle();
  if (error) { console.error('users lookup failed:', error.message); process.exit(1); }
  if (!data) { console.error(`No user found with phone ${phone}`); process.exit(2); }
  userId = data.id;
  userRow = data;
} else {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, phone, credits, is_admin, is_premium, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) { console.error('User lookup failed'); process.exit(1); }
  userRow = data;
}

console.log('\n═══ USER ═══════════════════════════════════════════════════════════');
console.log(`  id        : ${userRow.id}`);
console.log(`  name      : ${userRow.name ?? '(unset)'}`);
console.log(`  email     : ${userRow.email ?? '(none)'}`);
console.log(`  phone     : ${userRow.phone ?? '(none)'}`);
console.log(`  credits   : ${userRow.credits}`);
console.log(`  flags     : ${userRow.is_admin ? 'ADMIN ' : ''}${userRow.is_premium ? 'PRO ' : ''}`);
console.log(`  joined    : ${new Date(userRow.created_at).toISOString().slice(0, 10)}`);

// ── 2. Count rows in each AI-content table ───────────────────────────────────
const tables = [
  // Reports + combined
  { name: 'reports',                       col: 'user_id', label: 'Reports' },
  { name: 'combined_reports',              col: 'user_id', label: 'Combined reports' },
  // Divisional analyses
  { name: 'divisional_chart_analyses',     col: 'user_id', label: 'Divisional chart analyses' },
  // Life journey
  { name: 'life_journey_events',           col: 'user_id', label: 'Life journey events' },
  { name: 'life_journey_insights',         col: 'user_id', label: 'Life journey insights' },
  { name: 'life_area_insights',            col: 'user_id', label: 'Life area insights' },
  { name: 'feature_insights',              col: 'user_id', label: 'Feature insights' },
  // Tail
  { name: 'chat_sessions',                 col: 'user_id', label: 'Chat sessions' },
  { name: 'monthly_snapshot',              col: 'user_id', label: 'Monthly snapshots' },
  { name: 'mantras',                       col: 'user_id', label: 'Mantras' },
  { name: 'couple_analyses',               col: 'user_id', label: 'Couple analyses' },
  // Deterministic — list for context but DON'T regen
  { name: 'kundli_charts',                 col: 'user_id', label: 'Kundli charts (deterministic — DO NOT regen)' },
];

console.log('\n═══ AI CONTENT INVENTORY ═══════════════════════════════════════════');
console.log(`  ${'Table'.padEnd(40)} ${'Count'.padStart(6)}   Status`);
console.log(`  ${'─'.repeat(40)} ${'─'.repeat(6)}   ─────────`);

let totalRegenRows = 0;
for (const t of tables) {
  const { count, error } = await supabase
    .from(t.name)
    .select('*', { count: 'exact', head: true })
    .eq(t.col, userId);
  if (error) {
    console.log(`  ${t.label.padEnd(40)} ${'ERR'.padStart(6)}   ${error.message.slice(0, 40)}`);
    continue;
  }
  const isDeterministic = t.label.includes('DO NOT');
  const status = count === 0 ? 'empty' : isDeterministic ? 'skip (math)' : 'REGEN';
  if (!isDeterministic) totalRegenRows += count ?? 0;
  console.log(`  ${t.label.padEnd(40)} ${String(count ?? 0).padStart(6)}   ${status}`);
}

console.log('\n═══ SUMMARY ════════════════════════════════════════════════════════');
console.log(`  Total AI rows to regenerate: ${totalRegenRows}`);
console.log(`  Estimated time @ 8s/row     : ${Math.ceil(totalRegenRows * 8 / 60)} min`);
console.log(`  Estimated NIM tokens        : ~${totalRegenRows * 1500} (rough — depends on row type)`);
console.log('');
