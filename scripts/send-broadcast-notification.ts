/**
 * One-off: broadcast a push notification to every active (unrevoked) device
 * token. Usage: npx tsx scripts/send-broadcast-notification.ts "Title" "Body"
 */
import { db } from '../src/config/db.js';
import { devicePushTokens } from '../src/db/schema.js';
import { isNull } from 'drizzle-orm';
import { sendPushBatch } from '../src/lib/notifications/fcm.js';

async function main() {
  const title = process.argv[2] ?? 'Aroha Astrology';
  const body = process.argv[3] ?? 'Hello! Welcome to Aroha Astrology.';

  const rows = await db.select().from(devicePushTokens).where(isNull(devicePushTokens.revokedAt));
  console.log(`Sending to ${rows.length} active device token(s)...`);
  if (rows.length === 0) {
    console.log('No registered devices — nothing to send.');
    return;
  }

  const { success, failure } = await sendPushBatch(
    rows.map((r) => r.token),
    title,
    body,
  );
  console.log(`Done. success=${success} failure=${failure}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
