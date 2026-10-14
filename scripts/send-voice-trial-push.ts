// Sends the voice trial launch notification (Durga Puja 2026: "talk to Yogi
// Baba, 3 minutes free"). See src/modules/voice/voice-trial-launch.service.ts.
//
//   npx tsx scripts/send-voice-trial-push.ts --me <userId>   a try-out to one user
//   npx tsx scripts/send-voice-trial-push.ts --all           every user, once each
//
// --all is safe to run again: it only reaches users the earlier runs missed.
import 'dotenv/config';
import { sqlClient } from '../src/config/db.js';
import { logger } from '../src/lib/logger.js';
import { findActiveUserById } from '../src/modules/users/users.repo.js';
import { sendVoiceTrialLaunch } from '../src/modules/voice/voice-trial-launch.service.js';

async function main() {
  const [mode, userId] = process.argv.slice(2);

  if (mode === '--me' && userId) {
    const user = await findActiveUserById(userId);
    if (!user) throw new Error(`No active user ${userId}`);
    const result = await sendVoiceTrialLaunch({ onlyUser: { id: user.id, locale: user.locale } });
    logger.info(result, 'voice-trial-launch: try-out sent');
  } else if (mode === '--all') {
    const result = await sendVoiceTrialLaunch();
    logger.info(result, 'voice-trial-launch: sent to every user');
  } else {
    throw new Error('Usage: send-voice-trial-push.ts --me <userId> | --all');
  }

  await sqlClient.end();
}

main().catch((err) => {
  logger.error({ err }, 'send-voice-trial-push failed');
  process.exit(1);
});
