#!/usr/bin/env node
/**
 * Delete every report row for a set of users (by phone number) and refund what they paid
 * for each deleted row back to their wallet, so a re-purchase after this doesn't double-charge.
 * One-off admin cleanup — not part of any normal product flow, so there's no repo-layer
 * bulk-delete helper to reuse (see reports.repo.ts).
 *
 * `--dry-run` prints exactly what would be deleted/refunded without touching the DB.
 *
 * Usage:
 *   npx tsx scripts/delete-and-refund-reports.ts --dry-run +919632452162 +918779207574
 *   npx tsx scripts/delete-and-refund-reports.ts +919632452162 +918779207574
 */

import { findUserByPhoneE164, addWalletBalance } from '../src/modules/users/users.repo.js';
import { db } from '../src/config/db.js';
import { reports } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function run(phoneNumbers: string[], dryRun: boolean) {
  console.log(
    `\n🗑️  ${dryRun ? '[DRY RUN] ' : ''}Deleting reports for ${phoneNumbers.length} user(s)`,
  );

  const userRows = (await Promise.all(phoneNumbers.map(findUserByPhoneE164))).filter(
    (u): u is NonNullable<typeof u> => u != null,
  );

  if (userRows.length !== phoneNumbers.length) {
    const found = new Set(userRows.map((u) => u.phoneE164));
    const missing = phoneNumbers.filter((p) => !found.has(p));
    console.error(`❌ No user found for: ${missing.join(', ')}`);
    process.exit(1);
  }

  for (const user of userRows) {
    const userReports = await db.select().from(reports).where(eq(reports.userId, user.id));
    const totalRefundPaise = userReports.reduce((sum, r) => sum + r.pricePaidPaise, 0);

    console.log(`\n👤 ${user.displayName || user.phoneE164} (${user.id})`);
    console.log(`   Reports found: ${userReports.length}`);
    for (const r of userReports) {
      console.log(
        `     - ${r.reportKey}${r.periodMonth ? ` (${r.periodMonth})` : ''} — ${r.status} — ₹${(r.pricePaidPaise / 100).toFixed(2)}`,
      );
    }
    console.log(`   Total refund: ₹${(totalRefundPaise / 100).toFixed(2)}`);

    if (dryRun || userReports.length === 0) continue;

    await db.delete(reports).where(eq(reports.userId, user.id));
    if (totalRefundPaise > 0) {
      await addWalletBalance(user.id, totalRefundPaise, 'refund:admin_report_reset_2026_08_18');
    }
    console.log(
      `   ✅ Deleted ${userReports.length} report(s), refunded ₹${(totalRefundPaise / 100).toFixed(2)}`,
    );
  }

  console.log(`\n${dryRun ? '✅ Dry run complete — nothing was changed.' : '✅ Complete'}`);
  process.exit(0);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const phoneNumbers = args.filter((a) => a.startsWith('+'));

if (!phoneNumbers.length) {
  console.error(
    'Usage: npx tsx scripts/delete-and-refund-reports.ts [--dry-run] <phone> [phone2...]',
  );
  process.exit(1);
}

run(phoneNumbers, dryRun).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
