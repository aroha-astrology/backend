import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pgTable, uuid, timestamp, integer } from 'drizzle-orm/pg-core';

const onlineUserSamples = pgTable('online_user_samples', {
  id: uuid('id').primaryKey().defaultRandom(),
  sampledAt: timestamp('sampled_at', { withTimezone: true }).notNull().defaultNow(),
  onlineCount: integer('online_count').notNull(),
});

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing in environment/.env');
  }

  const client = postgres(databaseUrl, {
    ssl: 'prefer',
    prepare: false,
  });
  const db = drizzle(client);

  // Yesterday's date in IST (03 Sept 2026): 12:00 PM IST is 06:30 AM UTC
  const sampledAt = new Date('2026-09-03T06:30:00.000Z');
  const onlineCount = 17;

  console.log(`Inserting sample: onlineCount=${onlineCount} at ${sampledAt.toISOString()}...`);
  const result = await db
    .insert(onlineUserSamples)
    .values({
      sampledAt,
      onlineCount,
    })
    .returning();

  console.log('Inserted sample successfully:', result);
  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to insert sample:', err);
  process.exit(1);
});
