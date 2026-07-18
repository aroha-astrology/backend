import 'dotenv/config';
import { db } from '../config/db.js';
import { users } from '../db/schema.js';
import { decryptUserRow } from '../modules/users/users.repo.js';
import {
  requestHoroscopeGeneration,
  HOROSCOPE_PERIODS,
} from '../modules/horoscope/horoscope.service.js';
import { resolveProfileContext } from '../modules/birth-profiles/profile-context.js';

async function main() {
  // dateOfBirth/timeOfBirth/placeOfBirth are encrypted at rest — decrypt
  // before generating, same as the daily-horoscope cron path.
  const allUsers = (await db.select().from(users)).map(decryptUserRow);
  console.log(`Found ${allUsers.length} users. Regenerating horoscopes...`);

  for (const user of allUsers) {
    console.log(`User: ${user.id}`);
    // This one-off script isn't profile-aware — always the primary/self
    // profile, matching its pre-multi-profile behavior exactly.
    const profile = await resolveProfileContext(user, null);
    for (const period of HOROSCOPE_PERIODS) {
      console.log(`  -> period: ${period}`);
      await requestHoroscopeGeneration(user, profile, period, { force: true });
      // Add a small sleep to not overwhelm the LLM API
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log('Done regenerating all horoscopes!');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
