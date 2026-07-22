/**
 * One-off: force-regenerate the cached AI intro/notes for every already-unlocked
 * gemstone report — both primary profiles (users.gemstoneUnlockedAt) and
 * additional birth_profiles (birthProfiles.gemstoneUnlockedAt). Deterministic
 * content (dos/donts/mantra/etc.) is now recomputed fresh on every read and
 * self-heals with no backfill — this script exists only to refresh the
 * AI-authored prose (and clears any cached translations of it, which
 * markGemstoneReady now resets automatically on write).
 *
 * Re-run whenever the gemstone LLM prompt (src/lib/llm/gemstone.ts) changes in
 * a way that should apply to already-unlocked reports — e.g. the 2026-07-19
 * fix that banned raw dignity jargon ("own sign", "debilitated", etc.) from
 * leaking into the note text. This script was last run 2026-07-17, before
 * that fix existed and before birth_profiles existed, so every report
 * unlocked before 2026-07-19 (on any profile) is still on stale pre-fix text.
 *
 * Usage: npx tsx scripts/regenerate-gemstone-all.ts
 */
import 'dotenv/config';
import { and, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../src/config/db.js';
import { users, birthProfiles } from '../src/db/schema.js';
import { findKundliByUserId } from '../src/modules/kundli/kundli.repo.js';
import { requestGemstoneGeneration } from '../src/modules/gemstone/gemstone.service.js';

interface Target {
  userId: string;
  birthProfileId: string | null;
  label: string;
}

async function main() {
  const primaryUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(isNotNull(users.gemstoneUnlockedAt));

  const additionalProfiles = await db
    .select({ id: birthProfiles.id, ownerUserId: birthProfiles.ownerUserId })
    .from(birthProfiles)
    .where(and(isNotNull(birthProfiles.gemstoneUnlockedAt), isNull(birthProfiles.deletedAt)));

  const targets: Target[] = [
    ...primaryUsers.map((u): Target => ({ userId: u.id, birthProfileId: null, label: u.id })),
    ...additionalProfiles.map(
      (p): Target => ({
        userId: p.ownerUserId,
        birthProfileId: p.id,
        label: `${p.ownerUserId} / profile ${p.id}`,
      }),
    ),
  ];

  console.log(
    `Found ${primaryUsers.length} primary + ${additionalProfiles.length} additional-profile unlocked gemstone report(s) — ${targets.length} total.`,
  );

  let regenerated = 0;
  let skipped = 0;
  let failed = 0;

  for (const { userId, birthProfileId, label } of targets) {
    const kundli = await findKundliByUserId(userId, birthProfileId);
    if (!kundli || kundli.status !== 'ready') {
      console.log(`  ${label}: skipped (no ready kundli)`);
      skipped++;
      continue;
    }
    try {
      const result = await requestGemstoneGeneration(
        userId,
        birthProfileId,
        { chartData: kundli.chartData },
        { force: true },
      );
      console.log(`  ${label}: ${result}`);
      if (result === 'generated') regenerated++;
      else skipped++;
    } catch (err) {
      console.error(`  ${label}: ERROR`, err instanceof Error ? err.message : err);
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
