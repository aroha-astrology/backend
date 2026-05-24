#!/usr/bin/env tsx
/**
 * Stress test Phase 5: delete all 10 dummy users and their data.
 *
 * Usage:
 *   pnpm tsx scripts/stress-test/cleanup.ts --prod
 *   pnpm tsx scripts/stress-test/cleanup.ts --prod --keep   (skip deletion, just report what exists)
 */

import './config';
import * as fs from 'fs';
import * as path from 'path';
import { createAdmin } from './lib/supabaseAdmin';
import { confirm } from './lib/confirm';
import { assertEnv } from './lib/env';
import { EMAIL_PREFIX, EMAIL_DOMAIN } from './config';
import type { SeededUser } from './seed';

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  assertEnv();

  if (!process.argv.includes('--prod')) {
    console.error('\n[cleanup] You must pass --prod to run against production.\n');
    process.exit(1);
  }

  const keepOnly = process.argv.includes('--keep');
  const admin = createAdmin();

  // Load users.json if available
  const usersJsonPath = path.join(__dirname, 'results', 'users.json');
  let knownUsers: SeededUser[] = [];
  if (fs.existsSync(usersJsonPath)) {
    knownUsers = JSON.parse(fs.readFileSync(usersJsonPath, 'utf-8'));
  }

  // Find all stress-test users in DB (authoritative source)
  const { data: dbUsers, error: listErr } = await admin
    .from('users')
    .select('id, email, credits')
    .ilike('email', `${EMAIL_PREFIX}%${EMAIL_DOMAIN}`);

  if (listErr) {
    console.error('[cleanup] Failed to query users:', listErr.message);
    process.exit(1);
  }

  if (!dbUsers || dbUsers.length === 0) {
    console.log('[cleanup] No stress-test users found in DB. Nothing to do.');
    return;
  }

  console.log(`\n[cleanup] Found ${dbUsers.length} stress-test users:`);
  dbUsers.forEach((u) => console.log(`  - ${u.email} (${u.id}) credits=${u.credits}`));

  if (keepOnly) {
    console.log('\n[cleanup] --keep flag set. Skipping deletion.');
    return;
  }

  console.log(`\n⚠️  This will DELETE ${dbUsers.length} users and ALL their data from PRODUCTION.`);
  const ok = await confirm('Proceed with deletion?');
  if (!ok) { console.log('Aborted.'); process.exit(0); }

  const userIds = dbUsers.map((u) => u.id);

  // 1. Delete from public.users (cascades to all dependent tables via ON DELETE CASCADE)
  const { error: pubDelErr } = await admin
    .from('users')
    .delete()
    .in('id', userIds);

  if (pubDelErr) {
    console.error('[cleanup] Failed to delete from public.users:', pubDelErr.message);
    console.error('  Manual cleanup needed in Supabase dashboard.');
  } else {
    console.log(`[cleanup] ✓ Deleted ${userIds.length} rows from public.users (cascade to all dependent tables)`);
  }

  // 2. Delete from auth.users (idempotent — skip if already gone)
  let authDelCount = 0;
  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !error.message.includes('not found') && !error.message.includes('User not found')) {
      console.warn(`[cleanup] WARN: auth.deleteUser(${userId}) failed: ${error.message}`);
    } else {
      authDelCount++;
    }
    await sleep(100);
  }
  console.log(`[cleanup] ✓ Deleted ${authDelCount}/${userIds.length} auth users`);

  // 3. Verify
  const { data: remaining } = await admin
    .from('users')
    .select('id')
    .ilike('email', `${EMAIL_PREFIX}%${EMAIL_DOMAIN}`);

  if (!remaining || remaining.length === 0) {
    console.log('[cleanup] ✓ Verified: no stress-test users remain in DB');
  } else {
    console.warn(`[cleanup] WARN: ${remaining.length} users still exist — check for RLS issues`);
  }

  // 4. Archive results (don't delete — keep for analysis)
  console.log('\n[cleanup] Results in scripts/stress-test/results/ are preserved for analysis.');
  console.log('[cleanup] Done.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
