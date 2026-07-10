import 'dotenv/config';
import { db } from '../config/db.js';
import { users } from '../db/schema.js';
import {
  requestHoroscopeGeneration,
  HOROSCOPE_PERIODS,
} from '../modules/horoscope/horoscope.service.js';

async function main() {
  const allUsers = await db.select().from(users);
  console.log(`Found ${allUsers.length} users. Regenerating horoscopes...`);

  for (const user of allUsers) {
    console.log(`User: ${user.id}`);
    for (const period of HOROSCOPE_PERIODS) {
      console.log(`  -> period: ${period}`);
      await requestHoroscopeGeneration(user, period, { force: true });
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
