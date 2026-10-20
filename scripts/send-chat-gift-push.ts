// Dussehra 2026 gift: 2 free chat questions to every user, then the
// announcement. See src/config/chat-gifts.ts and
// src/modules/pass/chat-gift-launch.service.ts. Run AFTER the deploy.
//
//   npx tsx scripts/send-chat-gift-push.ts --grant           give the gift to every user
//   npx tsx scripts/send-chat-gift-push.ts --me <userId>     gift + a try-out push to one user
//   npx tsx scripts/send-chat-gift-push.ts --all             announce to every gift holder, once each
//
// All three are safe to run again: nobody gets the gift or the push twice.
import 'dotenv/config';
import { sqlClient } from '../src/config/db.js';
import { DUSSEHRA_2026_GIFT } from '../src/config/chat-gifts.js';
import { logger } from '../src/lib/logger.js';
import { findActiveUserById } from '../src/modules/users/users.repo.js';
import { grantChatGift, grantChatGiftToAllUsers } from '../src/modules/pass/chat-gifts.repo.js';
import { sendChatGiftLaunch } from '../src/modules/pass/chat-gift-launch.service.js';

async function main() {
  const [mode, userId] = process.argv.slice(2);
  if (Date.now() >= DUSSEHRA_2026_GIFT.validUntil.getTime()) {
    throw new Error('The Dussehra gift has already ended; nothing to grant or announce.');
  }

  if (mode === '--grant') {
    const granted = await grantChatGiftToAllUsers(DUSSEHRA_2026_GIFT);
    logger.info({ granted }, 'chat-gift: granted to every user');
  } else if (mode === '--me' && userId) {
    const user = await findActiveUserById(userId);
    if (!user) throw new Error(`No active user ${userId}`);
    const granted = await grantChatGift(user.id, DUSSEHRA_2026_GIFT);
    const result = await sendChatGiftLaunch({ onlyUser: { id: user.id, locale: user.locale } });
    logger.info({ granted, ...result }, 'chat-gift: try-out sent');
  } else if (mode === '--all') {
    const result = await sendChatGiftLaunch();
    logger.info(result, 'chat-gift: announced to every gift holder');
  } else {
    throw new Error('Usage: send-chat-gift-push.ts --grant | --me <userId> | --all');
  }

  await sqlClient.end();
}

main().catch((err) => {
  logger.error({ err }, 'send-chat-gift-push failed');
  process.exit(1);
});
