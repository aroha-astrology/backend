/**
 * One-off maintenance script: force-regenerate weekly/monthly/yearly horoscopes
 * for every active user, ONE USER AT A TIME (sequential, not the bulk cron
 * batch), so a single user's failure is visible immediately and doesn't
 * silently blend into a big batch run. Backfills real Finance/Education
 * category content (and yearly per-month category hooks) for existing users
 * instead of waiting for each period's natural cache expiry (yearly could
 * otherwise be up to a year away).
 *
 * Usage: npx tsx scripts/regenerate-categories-backfill.ts
 */
import { listActiveUsersAfter } from '../src/modules/horoscope/horoscope.repo.js';
import {
  requestHoroscopeGeneration,
  currentPeriodStart,
} from '../src/modules/horoscope/horoscope.service.js';

const PERIODS = ['weekly', 'monthly', 'yearly'] as const;
const PAGE_SIZE = 50;

async function main() {
  let afterId: string | null = null;
  let userCount = 0;
  let okCount = 0;
  let failCount = 0;

  for (;;) {
    const page = await listActiveUsersAfter(afterId, PAGE_SIZE);
    if (page.length === 0) break;

    for (const user of page) {
      userCount++;
      console.log(`\n[${userCount}] user ${user.id} (${user.displayName ?? 'unnamed'})`);
      for (const period of PERIODS) {
        try {
          const result = await requestHoroscopeGeneration(user, period, {
            forDate: currentPeriodStart(period),
            force: true,
            retryForever: false,
          });
          console.log(`  ${period}: ${result}`);
          if (result === 'generated') okCount++;
          if (result === 'failed') failCount++;
        } catch (err) {
          failCount++;
          console.error(`  ${period}: ERROR`, err instanceof Error ? err.message : err);
        }
      }
    }

    afterId = page[page.length - 1]!.id;
  }

  console.log(`\nDone. users=${userCount} generated=${okCount} failed=${failCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
