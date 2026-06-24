/**
 * Purge ALL users from Supabase auth + all cascaded app data.
 * Run once with: node scripts/purge-all-users.mjs
 * Deleting from auth.users cascades → public.users → all child tables.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function purgeAllUsers() {
  console.log('Fetching all auth users...');

  let allUsers = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    if (!data.users.length) break;
    allUsers = allUsers.concat(data.users);
    if (data.users.length < perPage) break;
    page++;
  }

  console.log(`Found ${allUsers.length} user(s).`);

  if (allUsers.length === 0) {
    console.log('No users to delete. Auth is already clean.');
    return;
  }

  for (const user of allUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.error(`  FAILED to delete ${user.email} (${user.id}): ${error.message}`);
    } else {
      console.log(`  Deleted: ${user.email ?? user.id}`);
    }
  }

  // Double-check: wipe any orphaned public.users rows (no auth row)
  const { error: wipeErr } = await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (wipeErr) {
    console.warn('Warning cleaning orphaned public.users rows:', wipeErr.message);
  }

  console.log('\nDone. All users deleted. Fresh login will create a new account.');
}

purgeAllUsers().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
