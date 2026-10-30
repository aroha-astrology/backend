// Sends the "Aroha Pass is now double" notification (2026-10-30). See
// src/modules/pass/pass-double-launch.service.ts.
//
//   npx tsx scripts/send-pass-double-push.ts --me <userId>   a try-out to one user
//   npx tsx scripts/send-pass-double-push.ts --all           every user, once each
//
// --all is safe to run again: it only reaches users the earlier runs missed.
import 'dotenv/config';
import { sqlClient } from '../src/config/db.js';
import { logger } from '../src/lib/logger.js';
import { findActiveUserById } from '../src/modules/users/users.repo.js';
import { sendPassDouble } from '../src/modules/pass/pass-double-launch.service.js';

async function main() {
  const [mode, userId] = process.argv.slice(2);

  if (mode === '--me' && userId) {
    const user = await findActiveUserById(userId);
    if (!user) throw new Error(`No active user ${userId}`);
    const result = await sendPassDouble({ onlyUser: { id: user.id, locale: user.locale } });
    logger.info(result, 'pass-double: try-out sent');
  } else if (mode === '--all') {
    const result = await sendPassDouble();
    logger.info(result, 'pass-double: sent to every user');
  } else {
    throw new Error('Usage: send-pass-double-push.ts --me <userId> | --all');
  }

  await sqlClient.end();
}

main().catch((err) => {
  logger.error({ err }, 'send-pass-double-push failed');
  process.exit(1);
});
