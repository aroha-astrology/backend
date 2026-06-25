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

export async function sendPushBatch(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ success: number; failure: number }> {
  if (tokens.length === 0) return { success: 0, failure: 0 };

  try {
    getFirebaseApp();
    const messaging = getMessaging();
    const messages = tokens.map((token) => ({
      token,
      notification: { title, body },
      ...(data !== undefined ? { data } : {}),
    }));
    const response = await messaging.sendEach(messages);
    return {
      success: response.successCount,
      failure: response.failureCount,
    };
  } catch (err) {
    logger.error({ err }, 'fcm:sendPushBatch failed');
    return { success: 0, failure: tokens.length };
  }
}
