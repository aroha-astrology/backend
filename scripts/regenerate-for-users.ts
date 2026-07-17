#!/usr/bin/env node
/**
 * Regenerate horoscopes for specific users by phone number.
 *
 * Usage:
 *   npx ts-node scripts/regenerate-for-users.ts +919535960988 +919693816242
 *   npx ts-node scripts/regenerate-for-users.ts +919535960988 daily tomorrow
 */

import { findUserByPhoneE164 } from '../src/modules/users/users.repo.js';
import { requestHoroscopeGeneration } from '../src/modules/horoscope/horoscope.service.js';
import type { HoroscopePeriod } from '../src/modules/horoscope/horoscope.schemas.js';

const HOROSCOPE_PERIODS: readonly HoroscopePeriod[] = [
  'daily',
  'tomorrow',
  'weekly',
  'monthly',
  'yearly',
];

async function regenerateForUsers(phoneNumbers: string[], periods?: HoroscopePeriod[]) {
  console.log(`\n🔄 Regenerating horoscopes for ${phoneNumbers.length} user(s)`);
  if (periods?.length) {
    console.log(`📅 Periods: ${periods.join(', ')}`);
  } else {
    console.log(`📅 Periods: all (${HOROSCOPE_PERIODS.join(', ')})`);
  }

  const periodsToGenerate = periods?.length ? periods : [...HOROSCOPE_PERIODS];

  // Fetch users by phone numbers — phoneE164 is encrypted at rest, so this
  // goes through the repo's hash-index lookup one number at a time rather
  // than a plaintext inArray() match.
  const userRows = (await Promise.all(phoneNumbers.map(findUserByPhoneE164))).filter(
    (u): u is NonNullable<typeof u> => u != null,
  );

  if (userRows.length === 0) {
    console.error(`❌ No users found for: ${phoneNumbers.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n✅ Found ${userRows.length} user(s):`);
  for (const user of userRows) {
    console.log(`   - ${user.displayName || user.id} (${user.phoneE164})`);
  }

  // Regenerate for each user and period
  let totalGenerated = 0;
  let totalFailed = 0;

  for (const user of userRows) {
    console.log(`\n👤 Regenerating for: ${user.displayName || user.phoneE164}`);

    for (const period of periodsToGenerate) {
      try {
        const result = await requestHoroscopeGeneration(user, period, { force: true });
        const icon = result === 'generated' ? '✅' : result === 'skipped' ? '⏭️ ' : '❌';
        console.log(`   ${icon} ${period.padEnd(10)} - ${result}`);
        if (result === 'generated') totalGenerated++;
        if (result === 'failed') totalFailed++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`   ❌ ${period.padEnd(10)} - Error: ${errMsg}`);
        totalFailed++;
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Generated: ${totalGenerated}`);
  console.log(`   Failed: ${totalFailed}`);
  console.log(`\n✅ Complete`);
  process.exit(0);
}

// Parse arguments
const args = process.argv.slice(2);
if (!args.length) {
  console.error(
    'Usage: npx ts-node scripts/regenerate-for-users.ts <phone> [phone2...] [period1 period2...]',
  );
  console.error('Example: npx ts-node scripts/regenerate-for-users.ts +919535960988 +919693816242');
  console.error(
    'Example: npx ts-node scripts/regenerate-for-users.ts +919535960988 daily tomorrow',
  );
  process.exit(1);
}

// Separate phone numbers from periods
const phoneNumbers: string[] = [];
const periods: HoroscopePeriod[] = [];

for (const arg of args) {
  if (arg.startsWith('+')) {
    phoneNumbers.push(arg);
  } else if (HOROSCOPE_PERIODS.includes(arg as HoroscopePeriod)) {
    periods.push(arg as HoroscopePeriod);
  }
}

if (!phoneNumbers.length) {
  console.error('❌ No phone numbers provided');
  process.exit(1);
}

regenerateForUsers(phoneNumbers, periods.length ? periods : undefined).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
