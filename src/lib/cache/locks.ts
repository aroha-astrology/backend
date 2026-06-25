import crypto from 'node:crypto';
import { getRedis } from '../../config/redis.js';
import { logger } from '../logger.js';

export async function acquire(
  prefix: string,
  id: string,
  ttlSeconds = 30,
): Promise<string | null> {
  const owner = crypto.randomUUID();
  try {
    const redis = getRedis();
    const key = `lock:${prefix}:${id}`;
    const result = await redis.set(key, owner, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? owner : null;
  } catch (err) {
    logger.warn({ err }, 'lock:acquire failed');
    return null;
  }
}

export async function release(prefix: string, id: string, owner: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `lock:${prefix}:${id}`;
    const current = await redis.get(key);
    if (current === owner) {
      await redis.del(key);
      return true;
    }
    return false;
  } catch (err) {
    logger.warn({ err }, 'lock:release failed');
    return false;
  }
}

export async function isLocked(prefix: string, id: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `lock:${prefix}:${id}`;
    return (await redis.exists(key)) === 1;
  } catch (err) {
    logger.warn({ err }, 'lock:isLocked failed');
    return false;
  }
}
