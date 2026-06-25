#!/usr/bin/env tsx
/**
 * Smoke-test for the puja-booking + pandit feature.
 *
 *   pnpm dlx tsx scripts/smoke-test-puja-booking.ts
 *
 * Checks (no browser interaction):
 *   1. Migration applied — all new tables / view / columns exist
 *   2. Seeds present — 50 pujas, ~29 offerings, all with image_path
 *   3. Public routes render without 500 — homepage, /pandit/join, /pandit-puja,
 *      one /pandit-puja/[slug], and verify gated routes redirect (not crash)
 *   4. Pandit role gate works (/pandit/dashboard for unauthed → redirect)
 *
 * Exits non-zero if any check fails so it can be wired into CI.
 */
import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../apps/web/.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE         = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✔ ${name}`); pass++; }
  else    { console.error(`  ✘ ${name}${detail ? `  ${detail}` : ''}`); fail++; }
}

async function rolesAndB2BChecks() {
  console.log('\n— Roles + B2B schema (migration 047) —');

  // roles column accepts a multi-role array (no-op UPDATE; expect no check error)
  const { error: rolesErr } = await supabase
    .from('users')
    .update({ roles: ['pandit', 'astrologer'] })
    .eq('id', '00000000-0000-0000-0000-000000000000');
  check('users.roles accepts ["pandit","astrologer"]',
    !rolesErr || !/users_roles_known|check constraint/i.test(rolesErr.message || ''),
    rolesErr?.message);

  // has_role RPC exists (calling with anon user returns false, not error)
  const { data: hr, error: hrErr } = await supabase.rpc('has_role', { p_role: 'pandit' });
  check('has_role() RPC exists', !hrErr && (hr === true || hr === false), hrErr?.message);

  // B2B tables exist
  for (const t of ['interaction_log', 'consultation_slots', 'astrologer_branding', 'astrologer_profiles', 'sync_outbox']) {
    const { error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    check(`table "${t}" exists`, !error, error?.message);
  }

  // chat_conversations got the new ai_for_customer_id column
  const { error: chatCol } = await supabase
    .from('chat_conversations').select('ai_for_customer_id', { count: 'exact', head: true });
  check('chat_conversations.ai_for_customer_id column exists',
    !chatCol || !/column .* does not exist/i.test(chatCol.message || ''),
    chatCol?.message);

  // astrologer_customers got the new columns
  const { error: acCol } = await supabase
    .from('astrologer_customers').select('phone,whatsapp,email,chart_data', { count: 'exact', head: true });
  check('astrologer_customers has phone/whatsapp/email/chart_data',
    !acCol || !/column .* does not exist/i.test(acCol.message || ''),
    acCol?.message);
}

async function dbChecks() {
  console.log('\n— DB / schema —');

  // 1. account_type 'pandit' allowed — no-op UPDATE against an id that doesn't
  //    exist. 0 rows affected = check constraint accepted the value; an error
  //    mentioning the check constraint means the migration didn't widen it.
  const { error: acctErr } = await supabase
    .from('users')
    .update({ account_type: 'pandit' })
    .eq('id', '00000000-0000-0000-0000-000000000000');
  check('account_type accepts "pandit"',
    !acctErr || !/users_account_type_check|check constraint/i.test(acctErr.message || ''),
    acctErr?.message);

  // 2. pujas count >= 50
  const { count: pujaCount, error: pujaErr } = await supabase
    .from('pujas').select('*', { count: 'exact', head: true });
  check(`pujas table has ≥50 rows (got ${pujaCount})`,
    !pujaErr && (pujaCount ?? 0) >= 50, pujaErr?.message);

  // 3. all pujas have image_path
  const { data: missingImg } = await supabase
    .from('pujas').select('slug').or('image_path.is.null,image_path.eq.');
  check(`every puja has image_path (${missingImg?.length ?? 0} missing)`,
    (missingImg?.length ?? 0) === 0);

  // 4. puja_offerings count
  const { count: offCount, error: offErr } = await supabase
    .from('puja_offerings').select('*', { count: 'exact', head: true });
  check(`puja_offerings has ≥10 rows (got ${offCount})`,
    !offErr && (offCount ?? 0) >= 10, offErr?.message);

  // 5. pandits_public view returns seed pandits
  const { count: ppCount, error: ppErr } = await supabase
    .from('pandits_public').select('*', { count: 'exact', head: true });
  check(`pandits_public view returns ≥10 rows (got ${ppCount})`,
    !ppErr && (ppCount ?? 0) >= 10, ppErr?.message);

  // 6. Empty booking tables exist (no rows yet OK)
  for (const t of ['puja_bookings', 'booking_members', 'booking_offerings', 'booking_messages', 'pandit_profiles']) {
    const { error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    check(`table "${t}" exists`, !error, error?.message);
  }
}

async function routeChecks() {
  console.log(`\n— HTTP routes (base: ${BASE}) —`);

  // Pick a known puja for the detail route
  const { data: anyPuja } = await supabase.from('pujas').select('slug').limit(1).maybeSingle();
  const slug = anyPuja?.slug ?? 'ganapathi-homam';

  const cases: { name: string; url: string; expect: number | number[] }[] = [
    { name: 'GET /',                          url: '/',                            expect: 200 },
    { name: 'GET /pandit/join (public)',      url: '/pandit/join',                 expect: 200 },
    { name: 'GET /pandit-puja',               url: '/pandit-puja',                 expect: [200, 307, 308] }, // may redirect to login
    { name: `GET /pandit-puja/${slug}`,       url: `/pandit-puja/${slug}`,         expect: [200, 307, 308] },
    { name: 'GET /pandit-puja/my-bookings → redirect when unauthed', url: '/pandit-puja/my-bookings', expect: [307, 308] },
    { name: 'GET /pandit/dashboard → redirect when unauthed',         url: '/pandit/dashboard',         expect: [307, 308] },
    { name: 'GET /api/pandit-puja/pujas',     url: '/api/pandit-puja/pujas',       expect: 200 },
    { name: 'GET /api/pandit-puja/pandits (no city → 400)', url: '/api/pandit-puja/pandits', expect: 400 },
    { name: 'GET /api/pandit-puja/pandits?city=delhi&puja_slug='+slug, url: `/api/pandit-puja/pandits?city=delhi&puja_slug=${slug}`, expect: 200 },
    { name: 'POST /api/puja-bookings unauthed → 401', url: '/api/puja-bookings', expect: 401 },
    // Phase B (astrologer portal) — gated routes redirect when unauthed, APIs return 401
    { name: 'GET /astrologer/dashboard → redirect unauthed', url: '/astrologer/dashboard', expect: [307, 308] },
    { name: 'GET /astrologer/clients   → redirect unauthed', url: '/astrologer/clients',   expect: [307, 308] },
    { name: 'GET /astrologer/clients/new → redirect unauthed', url: '/astrologer/clients/new', expect: [307, 308] },
    { name: 'GET /astrologer/matchmaking → redirect unauthed', url: '/astrologer/matchmaking', expect: [307, 308] },
    { name: 'GET /astrologer/calendar → redirect unauthed', url: '/astrologer/calendar', expect: [307, 308] },
    { name: 'GET /astrologer/analytics → redirect unauthed', url: '/astrologer/analytics', expect: [307, 308] },
    { name: 'GET /astrologer/settings → redirect unauthed', url: '/astrologer/settings', expect: [307, 308] },
    { name: 'GET /api/astrologer/clients unauthed → 401', url: '/api/astrologer/clients', expect: 401 },
    { name: 'GET /api/astrologer/interactions unauthed → 401', url: '/api/astrologer/interactions', expect: 401 },
  ];

  for (const c of cases) {
    try {
      const res = await fetch(BASE + c.url, {
        method: c.url === '/api/puja-bookings' ? 'POST' : 'GET',
        redirect: 'manual',
        headers: c.url === '/api/puja-bookings' ? { 'Content-Type': 'application/json' } : {},
        body: c.url === '/api/puja-bookings' ? '{}' : undefined,
      });
      const expected = Array.isArray(c.expect) ? c.expect : [c.expect];
      check(`${c.name} (${res.status})`, expected.includes(res.status));
    } catch (e) {
      check(c.name, false, (e as Error).message);
    }
  }

  // Verify GET pujas JSON has 50 entries
  try {
    const res = await fetch(BASE + '/api/pandit-puja/pujas');
    const j = await res.json();
    check(`/api/pandit-puja/pujas returns ≥50 pujas (got ${j.pujas?.length ?? 0})`,
      (j.pujas?.length ?? 0) >= 50);
  } catch (e) {
    check('/api/pandit-puja/pujas JSON shape', false, (e as Error).message);
  }
}

async function main() {
  await dbChecks();
  await rolesAndB2BChecks();
  await routeChecks();
  console.log(`\n— Summary —\n  ${pass} passed · ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
