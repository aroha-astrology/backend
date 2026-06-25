import Redis from 'ioredis';

let client: Redis | null = null;

function getClient(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (client) return client;

  client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 3000,
  });

  client.on('error', (err: Error) => {
    console.error('[Redis] error:', err.message);
  });

  return client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getClient();
  if (!r) return null;
  try {
    const val = await r.get(key);
    return val ? (JSON.parse(val) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const r = getClient();
  if (!r) return;
  try {
    const str = JSON.stringify(value);
    if (ttlSeconds) {
      await r.setex(key, ttlSeconds, str);
    } else {
      await r.set(key, str);
    }
  } catch {
    // ignore — cache write failures are non-fatal
  }
}

export async function cacheDel(key: string): Promise<void> {
  const r = getClient();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    // ignore
  }
}
