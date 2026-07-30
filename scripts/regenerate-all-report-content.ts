/**
 * One-off: regenerate the cached narrative (+ timing-window summaries) for every currently-`ready`
 * report, across every user and report type. Purchase records (price paid, purchase date) are
 * untouched — this only overwrites `content`/`translations` via overwriteReadyReportContent, no
 * refund, no re-purchase required. A per-row failure is logged and skipped; the previous content
 * is left in place for that row (never partially overwritten).
 *
 * Re-run whenever a report narrative/prompt fix (or the new window-summary enrichment) should
 * apply to already-purchased reports, not just new ones going forward.
 *
 * Usage: npx tsx scripts/regenerate-all-report-content.ts
 */
import 'dotenv/config';
import { findReadyReportRows } from '../src/modules/reports/reports.repo.js';
import { regenerateReportContent } from '../src/modules/reports/reports.service.js';

async function main() {
  const rows = await findReadyReportRows();
  console.log(`Found ${rows.length} ready report(s) to regenerate.`);

  let regenerated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const label = `${row.reportKey}${row.periodMonth ? `:${row.periodMonth}` : ''} (report ${row.id}, user ${row.userId})`;
    try {
      const result = await regenerateReportContent(row);
      console.log(`  ${label}: ${result}`);
      if (result === 'regenerated') regenerated++;
      else skipped++;
    } catch (err) {
      console.error(`  ${label}: ERROR`, err instanceof Error ? err.message : err);
      failed++;
    }
    // Small delay between rows so we don't hammer the Gemini API.
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone. Regenerated: ${regenerated}, skipped: ${skipped}, failed: ${failed}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
