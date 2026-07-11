import { db } from '../src/config/db.js';
import { users, dailyHoroscopes, houseInsights } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  requestHoroscopeGeneration,
  currentPeriodStart,
} from '../src/modules/horoscope/horoscope.service.js';
import {
  requestHouseInsightGeneration,
  getKundliForUser,
} from '../src/modules/kundli/kundli.service.js';

const PERIODS = ['daily', 'tomorrow', 'weekly', 'monthly', 'yearly'] as const;

async function main() {
  const phone = process.argv[2];
  if (!phone) throw new Error('Usage: force-regenerate.ts <phoneE164>');

  const [user] = await db.select().from(users).where(eq(users.phoneE164, phone)).limit(1);
  if (!user) {
    console.log('No user found');
    return;
  }
  console.log('Resetting and regenerating for:', user.id);

  // Force reset status to 'failed' so it bypasses 'generating' blocks
  await db
    .update(dailyHoroscopes)
    .set({ status: 'failed', updatedAt: new Date(0) })
    .where(eq(dailyHoroscopes.userId, user.id));
  await db
    .update(houseInsights)
    .set({ status: 'failed', updatedAt: new Date(0) })
    .where(eq(houseInsights.userId, user.id));

  for (const period of PERIODS) {
    const start = Date.now();
    try {
      const result = await requestHoroscopeGeneration(user, period, {
        forDate: currentPeriodStart(period),
        force: true,
        retryForever: false,
      });
      console.log(`  ${period}: ${result} (${Date.now() - start}ms)`);
    } catch (err) {
      console.error(`  ${period}: ERROR`, err);
    }
  }

  const kundli = await getKundliForUser(user.id);
  if (kundli && kundli.status === 'ready') {
    console.log('Regenerating Houses...');
    for (let house = 1; house <= 12; house++) {
      if (user.unlockedHouses?.includes(house)) {
        const start = Date.now();
        try {
          await requestHouseInsightGeneration(user.id, house, kundli);
          console.log(`  house ${house}: generated (${Date.now() - start}ms)`);
        } catch (err) {
          console.log(`  house ${house}: error`, err);
        }
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(console.error);
