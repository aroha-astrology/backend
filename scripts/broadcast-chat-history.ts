import 'dotenv/config';
import { getAllActiveTokens } from '../src/modules/device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../src/lib/notifications/fcm.js';
import { logger } from '../src/lib/logger.js';
import { pool } from '../src/config/db.js';

async function main() {
  logger.info('Starting Chat History Broadcast script...');
  
  const title = '✨ Your Chat History is here!';
  const body = 'You can now view and continue all your past Jyotish conversations. Tap to see what the stars discussed.';

  let tokens;
  try {
    tokens = await getAllActiveTokens();
  } catch (err) {
    logger.error({ err }, 'broadcast-chat-history failed to fetch tokens');
    process.exit(1);
  }

  if (tokens.length === 0) {
    logger.info('broadcast-chat-history no active tokens — nothing to send');
    process.exit(0);
  }

  const chunks: typeof tokens[] = [];
  const CHUNK_SIZE = 500;
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    chunks.push(tokens.slice(i, i + CHUNK_SIZE));
  }

  let totalSuccess = 0;
  let totalFailure = 0;

  for (const chunk of chunks) {
    const rawTokens = chunk.map((c) => c.token);
    try {
      const result = await sendPushBatch(rawTokens, {
        title,
        body,
        data: { route: '/chat-history' },
      });
      totalSuccess += result.successCount;
      totalFailure += result.failureCount;
    } catch (err) {
      logger.error({ err }, 'broadcast-chat-history batch send failed entirely');
    }
  }

  logger.info({ totalSuccess, totalFailure }, 'Chat History Broadcast complete');
  
  // Close the DB connection so the script can exit
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, 'Script failed');
  process.exit(1);
});
