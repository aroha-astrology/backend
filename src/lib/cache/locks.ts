import crypto from 'node:crypto';
import { getRedis } from '../../config/redis.js';
import { logger } from '../logger.js';

export async function acquire(prefix: string, id: string, ttlSeconds = 30): Promise<string | null> {
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

// Atomic compare-and-delete: only the owner may release, evaluated in a single
// round-trip so the lock can't expire-and-be-reacquired between check and del.
const RELEASE_LUA =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export async function release(prefix: string, id: string, owner: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `lock:${prefix}:${id}`;
    const deleted = (await redis.eval(RELEASE_LUA, 1, key, owner)) as number;
    return deleted === 1;
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
    // Fail closed: during a Redis outage, treat the resource as locked so
    // callers don't proceed into the critical section unguarded.
    logger.warn({ err }, 'lock:isLocked failed — failing closed (locked)');
    return true;
  }
}
