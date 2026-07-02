import crypto from 'node:crypto';
import { getRedis } from '../../config/redis.js';
import { logger } from '../logger.js';

const TTL_CHART = 86400; // 24h
const TTL_PREDICTION = 3600; // 1h

/** Canonical key derivation — the SINGLE source of truth for read and write. */
export function sourceHash(birthRecord: Record<string, unknown>): string {
  const data = JSON.stringify(birthRecord);
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

export async function getCachedChart(
  userId: string,
  birthRecord: Record<string, unknown>,
): Promise<unknown | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(`chart:${userId}:${sourceHash(birthRecord)}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn({ err }, 'cache:getCachedChart failed');
    return null;
  }
}

export async function setCachedChart(
  userId: string,
  birthRecord: Record<string, unknown>,
  chart: unknown,
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(
      `chart:${userId}:${sourceHash(birthRecord)}`,
      TTL_CHART,
      JSON.stringify(chart),
    );
  } catch (err) {
    logger.warn({ err }, 'cache:setCachedChart failed');
  }
}

export async function getCachedPrediction(key: string): Promise<unknown | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(`pred:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn({ err }, 'cache:getCachedPrediction failed');
    return null;
  }
}

export async function setCachedPrediction(key: string, data: unknown): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(`pred:${key}`, TTL_PREDICTION, JSON.stringify(data));
  } catch (err) {
    logger.warn({ err }, 'cache:setCachedPrediction failed');
  }
}

export async function invalidateUserCharts(userId: string): Promise<void> {
  try {
    const redis = getRedis();
    // Non-blocking cursor scan instead of KEYS (which is O(N) over the whole
    // keyspace and blocks the Redis event loop).
    const pattern = `chart:${userId}:*`;
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (batch.length > 0) await redis.del(...batch);
    } while (cursor !== '0');
  } catch (err) {
    logger.warn({ err }, 'cache:invalidateUserCharts failed');
  }
}
