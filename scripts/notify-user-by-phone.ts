/**
 * One-off: look up a single user by phone (E.164), check for a registered
 * active device token, and send a push ONLY if one exists (never sends to a
 * "0 recipients" no-op silently — reports exactly what it found).
 * Usage: npx tsx scripts/notify-user-by-phone.ts "+919535960988" "Title" "Body"
 */
import { db } from '../src/config/db.js';
import { users, devicePushTokens } from '../src/db/schema.js';
import { and, eq, isNull } from 'drizzle-orm';
import { sendPushBatch } from '../src/lib/notifications/fcm.js';

async function main() {
  const phone = process.argv[2];
  const title = process.argv[3] ?? 'Aroha Astrology';
  const body = process.argv[4] ?? 'Hello! Welcome to Aroha Astrology.';
  if (!phone) throw new Error('Usage: notify-user-by-phone.ts <phoneE164> [title] [body]');

  const [user] = await db.select().from(users).where(eq(users.phoneE164, phone)).limit(1);
  if (!user) {
    console.log(`No user found with phone ${phone}`);
    return;
  }
  console.log(`Found user ${user.id} (${user.displayName ?? 'unnamed'})`);

  const tokens = await db
    .select()
    .from(devicePushTokens)
    .where(and(eq(devicePushTokens.userId, user.id), isNull(devicePushTokens.revokedAt)));

  console.log(`Active device tokens for this user: ${tokens.length}`);
  if (tokens.length === 0) {
    console.log('No registered device for this user yet — nothing sent.');
    return;
  }

  const { success, failure } = await sendPushBatch(
    tokens.map((t) => t.token),
    title,
    body,
  );
  console.log(`Sent. success=${success} failure=${failure}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
