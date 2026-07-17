/**
 * One-off: force-regenerate the cached AI intro/notes for every already-unlocked
 * gemstone report. Deterministic content (dos/donts/mantra/etc.) is now recomputed
 * fresh on every read and self-heals with no backfill — this script exists only to
 * refresh the AI-authored prose (and clears any cached translations of it, which
 * markGemstoneReady now resets automatically on write).
 *
 * Usage: npx tsx scripts/regenerate-gemstone-all.ts
 */
import 'dotenv/config';
import { isNotNull } from 'drizzle-orm';
import { db } from '../src/config/db.js';
import { users } from '../src/db/schema.js';
import { findKundliByUserId } from '../src/modules/kundli/kundli.repo.js';
import { requestGemstoneGeneration } from '../src/modules/gemstone/gemstone.service.js';

async function main() {
  const unlockedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(isNotNull(users.gemstoneUnlockedAt));

  console.log(`Found ${unlockedUsers.length} user(s) with an unlocked gemstone report.`);

  let regenerated = 0;
  let skipped = 0;
  let failed = 0;

  for (const { id: userId } of unlockedUsers) {
    const kundli = await findKundliByUserId(userId);
    if (!kundli || kundli.status !== 'ready') {
      console.log(`  ${userId}: skipped (no ready kundli)`);
      skipped++;
      continue;
    }
    try {
      const result = await requestGemstoneGeneration(
        userId,
        { chartData: kundli.chartData },
        { force: true },
      );
      console.log(`  ${userId}: ${result}`);
      if (result === 'generated') regenerated++;
      else skipped++;
    } catch (err) {
      console.error(`  ${userId}: ERROR`, err instanceof Error ? err.message : err);
      failed++;
    }
    // Small delay between calls so we don't hammer the LLM API.
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\nDone. Regenerated: ${regenerated}, skipped: ${skipped}, failed: ${failed}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
