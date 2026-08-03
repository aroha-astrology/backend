/**
 * One-off: send the same push (+ Bell inbox row) to a hardcoded list of
 * phone numbers (E.164). Reports found/not-found/token-count per number —
 * never a silent no-op. Generalizes notify-user-by-phone.ts to a list.
 * Usage: npx tsx scripts/notify-users-by-phone.ts
 */
import { db } from '../src/config/db.js';
import { devicePushTokens } from '../src/db/schema.js';
import { and, eq, isNull } from 'drizzle-orm';
import { notifyUser } from '../src/lib/notifications/notify-user.js';
import { findUserByPhoneE164 } from '../src/modules/users/users.repo.js';

const PHONES = [
  '+916397616266',
  '+917977004381',
  '+919916279426',
  '+918951256967',
  '+918105472167',
];

const TITLE = 'Share & Earn ₹100!';
const BODY =
  'Share Aroha Astrology with friends and family — earn ₹100 for every friend who joins!';

async function main() {
  for (const phone of PHONES) {
    const user = await findUserByPhoneE164(phone);
    if (!user) {
      console.log(`${phone}: no user found`);
      continue;
    }

    const tokens = await db
      .select()
      .from(devicePushTokens)
      .where(and(eq(devicePushTokens.userId, user.id), isNull(devicePushTokens.revokedAt)));

    if (tokens.length === 0) {
      console.log(`${phone}: user ${user.id} found, but no active device tokens — nothing sent`);
      continue;
    }

    await notifyUser(user.id, { title: TITLE, body: BODY, type: 'share_campaign' });
    console.log(`${phone}: user ${user.id} — sent to ${tokens.length} device(s)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
