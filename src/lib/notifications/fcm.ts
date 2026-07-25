import { getFirebaseApp } from '../../config/firebase.js';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from '../logger.js';

export async function sendPush(
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> {
  try {
    getFirebaseApp();
    const messaging = getMessaging();
    await messaging.send({
      token: deviceToken,
      notification: { title, body },
      ...(data !== undefined ? { data } : {}),
    });
    return true;
  } catch (err) {
    logger.warn({ err, deviceToken: deviceToken.slice(-8) }, 'fcm:sendPush failed');
    return false;
  }
}

/** `messaging.sendEach()` caps at 500 messages per call and throws above that — it does NOT chunk internally. */
const FCM_MAX_MESSAGES_PER_CALL = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function sendPushBatch(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ success: number; failure: number }> {
  if (tokens.length === 0) return { success: 0, failure: 0 };

  let messaging;
  try {
    getFirebaseApp();
    messaging = getMessaging();
  } catch (err) {
    // Preserve the never-throws contract every caller depends on — a Firebase
    // init failure fails this send the same way an individual chunk failure
    // below does, not by throwing out of the function.
    logger.error({ err }, 'fcm:sendPushBatch failed to initialize');
    return { success: 0, failure: tokens.length };
  }

  let success = 0;
  let failure = 0;
  for (const tokenChunk of chunk(tokens, FCM_MAX_MESSAGES_PER_CALL)) {
    const messages = tokenChunk.map((token) => ({
      token,
      notification: { title, body },
      ...(data !== undefined ? { data } : {}),
    }));
    try {
      const response = await messaging.sendEach(messages);
      success += response.successCount;
      failure += response.failureCount;
    } catch (err) {
      // Only this chunk is lost — a transient failure partway through a
      // large broadcast must not discard counts already collected from
      // chunks that succeeded before it.
      logger.error({ err, chunkSize: tokenChunk.length }, 'fcm:sendPushBatch chunk failed');
      failure += tokenChunk.length;
    }
  }
  return { success, failure };
}
