/**
 * Deletes every loadtest-* user: Postgres row (cascades to all dependent
 * tables via hardDeleteUserById) + the matching Firebase Auth user.
 *
 * MUST run on the EC2 box — needs DATABASE_URL and the Firebase Admin
 * service account, same as seed-users.ts.
 *
 * Usage (on the box):
 *   npx tsx scripts/load-test/cleanup.ts           # dry-run, lists matches
 *   npx tsx scripts/load-test/cleanup.ts --fire     # actually delete
 */
import { like } from 'drizzle-orm';
import { db, sqlClient } from '../../src/config/db.js';
import { users } from '../../src/db/schema.js';
import { hardDeleteUserById } from '../../src/modules/users/users.repo.js';
import { getFirebaseAuth } from '../../src/config/firebase.js';

const FIRE = process.argv.includes('--fire');

async function main() {
  const rows = await db
    .select({ id: users.id, firebaseUid: users.firebaseUid })
    .from(users)
    .where(like(users.firebaseUid, 'loadtest-%'));

  console.log(`Found ${rows.length} loadtest user(s).`);
  for (const r of rows) console.log(`  ${r.firebaseUid} -> ${r.id}`);

  if (!FIRE) {
    console.log('\nDry-run only. Re-run with --fire to actually delete.');
    await sqlClient.end();
    return;
  }

  const auth = getFirebaseAuth();
  for (const r of rows) {
    await hardDeleteUserById(r.id);
    try {
      await auth.deleteUser(r.firebaseUid);
    } catch (err) {
      console.error(
        `  Firebase deleteUser(${r.firebaseUid}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    console.log(`  deleted ${r.firebaseUid}`);
  }

  const remaining = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.firebaseUid, 'loadtest-%'));
  console.log(`\nDone. Remaining loadtest rows: ${remaining.length}`);

  await sqlClient.end();
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
