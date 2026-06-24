#!/usr/bin/env tsx
/**
 * Create one production user (with kundli generated and credits topped up)
 * and print email + password to stdout.
 *
 *   npx tsx scripts/stress-test/seed-one.ts --prod
 */

import './config';
import { createAdmin } from './lib/supabaseAdmin';
import { signIn } from './lib/auth';
import { createUserClient } from './lib/httpClient';
import { assertEnv } from './lib/env';
import { BASE_URL, CREDIT_TOPUP } from './config';

function randomPassword(): string {
  return `Sh!${Math.random().toString(36).slice(2, 12)}Ar9X`;
}

async function main() {
  assertEnv();
  if (!process.argv.includes('--prod')) {
    console.error('\n[seed-one] Pass --prod to run against production.\n');
    process.exit(1);
  }

  const admin = createAdmin();
  const stamp = Date.now().toString(36);
  const email = `demo+${stamp}@jyotish.local`;
  const password = randomPassword();
  const fixture = {
    name: 'Aanya Sharma',
    dob: '1994-08-22',
    tob: '07:42',
    pob: 'Mumbai, Maharashtra',
    latitude: 19.0760,
    longitude: 72.8777,
    timezone: 'Asia/Kolkata',
    gender: 'female' as const,
    tobSource: 'certificate',
  };

  console.log(`\n[seed-one] Creating user at ${BASE_URL}`);
  console.log(`[seed-one] Email: ${email}`);

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: fixture.name },
  });
  if (authErr || !authData) throw new Error(`createUser failed: ${authErr?.message}`);
  const userId = authData.user.id;
  console.log(`[seed-one] ✓ Auth user created: ${userId}`);

  const { error: rpcErr } = await admin.rpc('increment_credits', {
    p_user_id: userId,
    p_amount: CREDIT_TOPUP - 2,
  });
  if (rpcErr) {
    await admin.from('users').update({ credits: CREDIT_TOPUP }).eq('id', userId);
  }
  console.log(`[seed-one] ✓ Credits = ${CREDIT_TOPUP}`);

  const { cookieHeader } = await signIn(email, password);
  const client = createUserClient(cookieHeader);

  const kundliRes = await client.post('/api/kundli/generate', {
    ...fixture,
    isPrimary: true,
  });
  if (kundliRes.status !== 200) {
    throw new Error(`kundli/generate failed ${kundliRes.status}: ${JSON.stringify(kundliRes.data)}`);
  }
  const kundliData = kundliRes.data as { data: { chartId: string; profileId: string } };
  console.log(`[seed-one] ✓ Kundli generated: chartId=${kundliData.data.chartId}`);

  console.log('\n──────────────────────────────────────────────');
  console.log('  ✅ USER CREATED — credentials below');
  console.log('──────────────────────────────────────────────');
  console.log(`  URL:      ${BASE_URL}/login`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Name:     ${fixture.name}`);
  console.log(`  DOB/TOB:  ${fixture.dob} ${fixture.tob} ${fixture.pob}`);
  console.log(`  Credits:  ${CREDIT_TOPUP}`);
  console.log(`  User ID:  ${userId}`);
  console.log(`  Chart ID: ${kundliData.data.chartId}`);
  console.log('──────────────────────────────────────────────\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
