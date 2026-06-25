import crypto from 'node:crypto';
import { getRedis } from '../../config/redis.js';
import { logger } from '../logger.js';

const TTL_CHART = 86400; // 24h
const TTL_PREDICTION = 3600; // 1h

function sourceHash(birthRecord: Record<string, unknown>): string {
  const data = JSON.stringify(birthRecord);
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

export async function getCachedChart(userId: string, recordHash: string): Promise<unknown | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(`chart:${userId}:${recordHash}`);
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
    const hash = sourceHash(birthRecord);
    await redis.setex(`chart:${userId}:${hash}`, TTL_CHART, JSON.stringify(chart));
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
    const keys = await redis.keys(`chart:${userId}:*`);
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    logger.warn({ err }, 'cache:invalidateUserCharts failed');
  }
}
