/** Read-only: counts active (unrevoked) device push tokens. Usage: npx tsx scripts/count-device-tokens.ts */
import { db } from '../src/config/db.js';
import { devicePushTokens } from '../src/db/schema.js';
import { isNull } from 'drizzle-orm';

async function main() {
  const rows = await db.select().from(devicePushTokens).where(isNull(devicePushTokens.revokedAt));
  console.log(`Active device tokens: ${rows.length}`);
  const byPlatform: Record<string, number> = {};
  for (const r of rows) byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + 1;
  console.log('By platform:', byPlatform);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
