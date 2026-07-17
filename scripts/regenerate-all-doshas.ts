#!/usr/bin/env node
/**
 * One-off backfill: recompute doshaData for every ready kundli using the
 * chart already stored on the row (no need to recompute the chart itself —
 * Mars/Rahu/Saturn placements haven't changed, only the dosha descriptions
 * are new). Deliberately does NOT go through regenerateKundli(), which would
 * also re-trigger horoscope + house-insight LLM generation for every user —
 * pure waste for a fix that's 100% deterministic astro-engine output.
 *
 * Usage: npx tsx scripts/regenerate-all-doshas.ts
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/config/db.js';
import { kundlis } from '../src/db/schema.js';
import { analyzeAllDoshas } from '../src/lib/astro-engine/index.js';
import type { ChartData } from '@aroha-astrology/shared';

async function main() {
  const rows = await db.select().from(kundlis).where(eq(kundlis.status, 'ready'));
  console.log(`Found ${rows.length} ready kundli(s). Regenerating dosha descriptions...`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const chart = row.chartData as unknown as ChartData | null;
    const saturn = chart?.planets?.find((p) => p.planet === 'Saturn');
    if (!chart || !saturn) {
      console.warn(`  skip ${row.userId}: missing chart/Saturn data`);
      skipped++;
      continue;
    }

    const doshas = analyzeAllDoshas(chart, saturn.longitude);
    await db
      .update(kundlis)
      .set({ doshaData: doshas as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(kundlis.userId, row.userId));
    updated++;
  }

  console.log(`\nDone. Updated ${updated}, skipped ${skipped}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
