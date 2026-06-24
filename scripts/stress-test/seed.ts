#!/usr/bin/env tsx
/**
 * Stress test Phase 1: create 10 dummy users in production, top up credits,
 * generate kundli for each, and write results/users.json.
 *
 * Usage:
 *   pnpm tsx scripts/stress-test/seed.ts --prod
 */

import './config'; // side-effect: loads .env.local
import * as fs from 'fs';
import * as path from 'path';
import { createAdmin } from './lib/supabaseAdmin';
import { signIn } from './lib/auth';
import { createUserClient } from './lib/httpClient';
import { confirm } from './lib/confirm';
import { assertEnv } from './lib/env';
import { BIRTH_FIXTURES } from './fixtures/birthData';
import {
  BASE_URL, EMAIL_PREFIX, EMAIL_DOMAIN,
  CREDIT_TOPUP, SUPABASE_SERVICE_ROLE_KEY,
} from './config';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface SeededUser {
  idx: number;
  id: string;
  email: string;
  password: string;
  chartId: string;
  profileId: string;
  name: string;
  dob: string;
  tob: string;
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function randomPassword(idx: number): string {
  return `St!${idx}Stress${Math.random().toString(36).slice(2, 10)}X9`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────
// Preflight
// ─────────────────────────────────────────────────────────

async function preflight() {
  assertEnv();

  if (!process.argv.includes('--prod')) {
    console.error('\n[seed] You must pass --prod to run against production.\n');
    process.exit(1);
  }

  console.log('\n[preflight] Checking environment...');

  // 1. Dev/prod URL sanity check
  const isProdUrl = BASE_URL.includes('vercel.app') || (!BASE_URL.includes('localhost') && !BASE_URL.includes('127.0.0.1'));
  if (!isProdUrl) {
    console.warn(`[preflight] WARN: BASE_URL="${BASE_URL}" looks local but --prod was passed.`);
  }

  // 2. HTTP probe
  try {
    const r = await fetch(BASE_URL);
    if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
    console.log(`[preflight] ✓ App reachable at ${BASE_URL} (${r.status})`);
  } catch (e) {
    console.error(`[preflight] ✗ App not reachable at ${BASE_URL}: ${e}`);
    process.exit(1);
  }

  // 3. Service-role smoke test: create + delete a throwaway user
  const admin = createAdmin();
  const testEmail = `preflight-${Date.now()}@jyotish.local`;
  const { data: tmpUser, error: tmpErr } = await admin.auth.admin.createUser({
    email: testEmail,
    password: 'PF!smokeTest9x',
    email_confirm: true,
  });
  if (tmpErr || !tmpUser) {
    console.error('[preflight] ✗ admin.createUser failed:', tmpErr?.message);
    process.exit(1);
  }
  await admin.auth.admin.deleteUser(tmpUser.user.id);
  // Also clean up public.users row
  await admin.from('users').delete().eq('id', tmpUser.user.id);
  console.log('[preflight] ✓ Service-role admin.createUser works');

  // 4. Check for existing stress-test users
  const { data: existing } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', `${EMAIL_PREFIX}%${EMAIL_DOMAIN}`);
  if (existing && existing.length > 0) {
    console.warn(`[preflight] WARN: ${existing.length} stress-test users already exist. Run cleanup.ts --prod first or they will be reused.`);
  }

  console.log('[preflight] ✓ All checks passed\n');
}

// ─────────────────────────────────────────────────────────
// Seed single user
// ─────────────────────────────────────────────────────────

async function seedUser(idx: number): Promise<SeededUser> {
  const admin = createAdmin();
  const fixture = BIRTH_FIXTURES[idx];
  const email = `${EMAIL_PREFIX}${idx}${EMAIL_DOMAIN}`;
  const password = randomPassword(idx);

  // 1. Create auth user
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: fixture.name },
  });
  if (authErr || !authData) throw new Error(`createUser[${idx}] failed: ${authErr?.message}`);
  const userId = authData.user.id;
  console.log(`  [${idx}] ✓ Auth user created: ${email} (${userId})`);

  // 2. Top up credits — signup trigger gives 2 credits, we want CREDIT_TOPUP
  const topUpAmount = CREDIT_TOPUP - 2;
  const { error: rpcErr } = await admin.rpc('increment_credits', {
    p_user_id: userId,
    p_amount: topUpAmount,
  });
  if (rpcErr) {
    // Fallback: direct update via service role (bypasses RLS)
    const { error: updErr } = await admin
      .from('users')
      .update({ credits: CREDIT_TOPUP })
      .eq('id', userId);
    if (updErr) console.warn(`  [${idx}] WARN: credit top-up failed: ${updErr.message}`);
    else console.log(`  [${idx}] ✓ Credits set to ${CREDIT_TOPUP} (direct update)`);
  } else {
    console.log(`  [${idx}] ✓ Credits topped up to ${CREDIT_TOPUP}`);
  }

  // 3. Sign in to get session cookies
  const { cookieHeader } = await signIn(email, password);
  const client = createUserClient(cookieHeader);

  // Smoke-test auth via GET /api/credits/balance (cheap, auth-required)
  const balCheck = await client.get('/api/credits/balance');
  if (balCheck.status === 401) {
    throw new Error(`[${idx}] Cookie auth smoke-test failed (401). Check cookie format.`);
  }
  const balData = ((balCheck.data as Record<string, unknown>)?.data as Record<string, unknown>)?.credits;
  console.log(`  [${idx}] ✓ Cookie auth verified (credits: ${balData ?? '?'})`);

  // 4. Generate kundli
  const kundliBody = {
    name: fixture.name,
    dob: fixture.dob,
    tob: fixture.tob,
    pob: fixture.pob,
    latitude: fixture.latitude,
    longitude: fixture.longitude,
    timezone: fixture.timezone,
    gender: fixture.gender,
    tobSource: fixture.tobSource,
    isPrimary: true,
  };
  const kundliRes = await client.post('/api/kundli/generate', kundliBody);
  if (kundliRes.status !== 200) {
    throw new Error(`[${idx}] kundli/generate failed ${kundliRes.status}: ${JSON.stringify(kundliRes.data)}`);
  }
  const kundliData = kundliRes.data as Record<string, unknown>;
  const chartId = (kundliData.data as Record<string, unknown>)?.chartId as string;
  const profileId = (kundliData.data as Record<string, unknown>)?.profileId as string;
  if (!chartId) throw new Error(`[${idx}] kundli/generate returned no chartId`);
  console.log(`  [${idx}] ✓ Kundli generated: chartId=${chartId}`);

  return { idx, id: userId, email, password, chartId, profileId, name: fixture.name, dob: fixture.dob, tob: fixture.tob };
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

async function main() {
  await preflight();

  console.log(`\n⚠️  About to create 10 dummy users in PRODUCTION at: ${BASE_URL}`);
  console.log(`   Email pattern: ${EMAIL_PREFIX}0..9${EMAIL_DOMAIN}`);
  console.log(`   Credits per user: ${CREDIT_TOPUP}`);
  const proceed = await confirm('Proceed?');
  if (!proceed) { console.log('Aborted.'); process.exit(0); }

  const resultsDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, 'users.json');

  const seeded: SeededUser[] = [];
  console.log('\n[seed] Creating 10 users sequentially...\n');

  for (let i = 0; i < 10; i++) {
    try {
      const user = await seedUser(i);
      seeded.push(user);
      fs.writeFileSync(outPath, JSON.stringify(seeded, null, 2));
    } catch (e) {
      console.error(`  [${i}] ✗ FAILED: ${(e as Error).message}`);
      // Write partial progress so cleanup can still run
      fs.writeFileSync(outPath, JSON.stringify(seeded, null, 2));
    }
    // Small delay between users to spread NIM background load
    if (i < 9) await sleep(500);
  }

  console.log(`\n[seed] ✓ ${seeded.length}/10 users seeded → ${outPath}`);
  console.log('[seed] Waiting 30s for background scheduleAutoGeneration to drain...');
  await sleep(30_000);
  console.log('[seed] Done. Run: pnpm tsx scripts/stress-test/run.ts --prod\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
