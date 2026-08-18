/**
 * One-off: regenerate ONLY the "Final Verdict" card for every currently-`ready` report that
 * already has one — backfilling the fix for the verdict prompt that used to see every report's
 * `lifeContext` (career/health/wealth/love cross-domain data) and drift toward the SAME
 * career/wealth bullets and timing window regardless of the report's own topic (e.g. a Baby
 * Name or Health report's verdict talking about career/wealth) — see jyotish-backend's
 * lib/llm/reports/verdict.ts (VERDICT_TOPIC / VERDICT_EXCLUDED_KEYS) and
 * reports.service.ts's regenerateReportVerdict for the actual fix.
 *
 * Cheap on purpose: ONE LLM call per report (just the verdict), not the full narrative — every
 * other field in `content` (`sections`, `windowSummaries`, `contentVersion`) is left untouched.
 * Purchase records (price paid, purchase date) are untouched either way. A per-row failure is
 * logged and skipped; the row's existing (old, possibly wrong-topic) verdict is left in place
 * for that row rather than being partially overwritten or removed.
 *
 * Usage:
 *   npx tsx scripts/regenerate-report-verdicts.ts --dry-run   # logs what WOULD run, no writes
 *   npx tsx scripts/regenerate-report-verdicts.ts --id=<uuid> # a single report, for spot-checking
 *   npx tsx scripts/regenerate-report-verdicts.ts             # the full backfill
 */
import 'dotenv/config';
import { findReadyReportRows, findReportById } from '../src/modules/reports/reports.repo.js';
import { regenerateReportVerdict } from '../src/modules/reports/reports.service.js';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const idArg = args.find((a) => a.startsWith('--id='))?.slice('--id='.length);

  const rows = idArg
    ? [await findReportById(idArg)].filter((r): r is NonNullable<typeof r> => r !== undefined)
    : await findReadyReportRows();

  if (idArg && rows.length === 0) {
    console.error(`No report found with id ${idArg}`);
    process.exit(1);
  }

  console.log(
    `Found ${rows.length} ${idArg ? 'matching' : 'ready'} report(s)${dryRun ? ' (dry run — no writes)' : ''}.`,
  );

  let regenerated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const label = `${row.reportKey}${row.periodMonth ? `:${row.periodMonth}` : ''} (report ${row.id}, user ${row.userId})`;
    const hasVerdict = Boolean((row.content as { verdict?: unknown } | null)?.verdict);
    if (dryRun) {
      console.log(
        `  ${label}: ${hasVerdict ? 'WOULD regenerate' : 'would skip (no existing verdict)'}`,
      );
      if (hasVerdict) regenerated++;
      else skipped++;
      continue;
    }
    try {
      const result = await regenerateReportVerdict(row);
      console.log(`  ${label}: ${result}`);
      if (result === 'regenerated') regenerated++;
      else skipped++;
    } catch (err) {
      console.error(`  ${label}: ERROR`, err instanceof Error ? err.message : err);
      failed++;
    }
    // Small delay between rows so we don't hammer the Gemini API.
    if (!dryRun) await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone. Regenerated: ${regenerated}, skipped: ${skipped}, failed: ${failed}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
