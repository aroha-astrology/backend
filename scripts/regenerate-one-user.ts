/**
 * One-off: force-regenerate every period for a single user, identified by phone.
 * Usage: npx tsx scripts/regenerate-one-user.ts "+919535960988"
 */
import { findUserByPhoneE164 } from '../src/modules/users/users.repo.js';
import {
  requestHoroscopeGeneration,
  currentPeriodStart,
} from '../src/modules/horoscope/horoscope.service.js';
import { resolveProfileContext } from '../src/modules/birth-profiles/profile-context.js';

const PERIODS = ['daily', 'tomorrow', 'weekly', 'monthly', 'yearly'] as const;

async function main() {
  const phone = process.argv[2];
  if (!phone) throw new Error('Usage: regenerate-one-user.ts <phoneE164>');

  const user = await findUserByPhoneE164(phone);
  if (!user) {
    console.log(`No user found with phone ${phone}`);
    return;
  }
  console.log(`Regenerating all periods for ${user.id} (${user.displayName ?? 'unnamed'})`);
  // This one-off script isn't profile-aware — always the primary/self
  // profile, matching its pre-multi-profile behavior exactly.
  const profile = await resolveProfileContext(user, null);

  for (const period of PERIODS) {
    const start = Date.now();
    try {
      const result = await requestHoroscopeGeneration(user, profile, period, {
        forDate: currentPeriodStart(period),
        force: true,
        retryForever: false,
      });
      console.log(`  ${period}: ${result} (${Date.now() - start}ms)`);
    } catch (err) {
      console.error(
        `  ${period}: ERROR (${Date.now() - start}ms)`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
