import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake ioredis stand-in supporting exactly the four commands
// gemini-key-pool.ts uses (incr/get/set with PX/pttl), with real TTL
// bookkeeping driven off Date.now() so it plays correctly with fake timers —
// same "minimal in-memory stand-in" philosophy as rate-limit.spec.ts's fake
// Redis, just covering a different command surface.
function createFakeRedis() {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  let cursor = 0;

  function expireIfNeeded(key: string) {
    const entry = store.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key);
    }
  }

  return {
    store,
    incr: vi.fn((_key: string) => {
      cursor += 1;
      return Promise.resolve(cursor);
    }),
    get: vi.fn((key: string) => {
      expireIfNeeded(key);
      return Promise.resolve(store.get(key)?.value ?? null);
    }),
    set: vi.fn((key: string, value: string, mode?: string, ttlMs?: number) => {
      const expiresAt = mode === 'PX' && typeof ttlMs === 'number' ? Date.now() + ttlMs : null;
      store.set(key, { value, expiresAt });
      return Promise.resolve('OK');
    }),
    pttl: vi.fn((key: string) => {
      expireIfNeeded(key);
      const entry = store.get(key);
      if (!entry) return Promise.resolve(-2);
      if (entry.expiresAt === null) return Promise.resolve(-1);
      return Promise.resolve(Math.max(0, entry.expiresAt - Date.now()));
    }),
  };
}

const state = vi.hoisted(() => ({
  keyPool: ['key-0', 'key-1', 'key-2', 'key-3'] as string[],
}));

vi.mock('../src/config/env.js', () => ({
  env: { LOG_LEVEL: 'silent' },
  get GEMINI_KEY_POOL() {
    return state.keyPool;
  },
  isProduction: false,
  isTest: true,
}));

let fakeRedis: ReturnType<typeof createFakeRedis>;
let redisShouldFail = false;

vi.mock('../src/config/redis.js', () => ({
  getRedis: () => {
    if (redisShouldFail) {
      return {
        incr: () => Promise.reject(new Error('redis down')),
        get: () => Promise.reject(new Error('redis down')),
        set: () => Promise.reject(new Error('redis down')),
        pttl: () => Promise.reject(new Error('redis down')),
      };
    }
    return fakeRedis;
  },
}));

const pool = await import('../src/lib/llm/gemini-key-pool.js');

beforeEach(() => {
  vi.useRealTimers();
  state.keyPool = ['key-0', 'key-1', 'key-2', 'key-3'];
  fakeRedis = createFakeRedis();
  redisShouldFail = false;
  // Reset the module's local (in-process fallback) state between tests too,
  // since it's module-scoped and would otherwise leak across cases.
  pool.__resetForTests();
});

describe('poolSize', () => {
  it('reflects GEMINI_KEY_POOL length', () => {
    expect(pool.poolSize()).toBe(4);
    state.keyPool = ['only-one'];
    expect(pool.poolSize()).toBe(1);
  });
});

describe('pickKey round-robin', () => {
  it('spreads calls evenly across every key before any 429 has happened', async () => {
    const picks: number[] = [];
    for (let i = 0; i < 8; i++) {
      const picked = await pool.pickKey();
      expect(picked).not.toBeNull();
      picks.push(picked!.index);
    }
    // Every index appears, and the pool is walked round-robin, not left
    // hammering index 0 or picked randomly.
    expect(new Set(picks)).toEqual(new Set([0, 1, 2, 3]));
    // Two full laps around a 4-key pool: each index should appear exactly twice.
    for (let i = 0; i < 4; i++) {
      expect(picks.filter((p) => p === i)).toHaveLength(2);
    }
  });

  it('returns the key string matching the picked index', async () => {
    const picked = await pool.pickKey();
    expect(picked).not.toBeNull();
    expect(picked!.key).toBe(state.keyPool[picked!.index]);
  });

  it('skips indices passed in the exclude set', async () => {
    const excluded = new Set([0, 1, 2]);
    const picked = await pool.pickKey(excluded);
    expect(picked).not.toBeNull();
    expect(picked!.index).toBe(3);
  });

  it('returns null when every index is excluded', async () => {
    const picked = await pool.pickKey(new Set([0, 1, 2, 3]));
    expect(picked).toBeNull();
  });
});

describe('markRateLimited + cooldown exclusion', () => {
  it('a cooldown-marked key is never returned by a subsequent, independent pickKey() call', async () => {
    // Simulates the "unrelated concurrent request" scenario: some other
    // request already marked index 1 as cooling down; a fresh pickKey() call
    // (its own exclude set, nothing to do with the call that caused the 429)
    // must still never hand back index 1 while it's cooling.
    await pool.markRateLimited(1, 5000);

    for (let i = 0; i < 8; i++) {
      const picked = await pool.pickKey();
      expect(picked).not.toBeNull();
      expect(picked!.index).not.toBe(1);
    }
  });

  it('a key becomes available again once its cooldown TTL is set to have expired', async () => {
    await pool.markRateLimited(2, 1000);
    // Directly age out the cooldown key rather than sleeping — same
    // TTL-expiry mechanism createFakeRedis uses internally.
    const cooldownEntry = fakeRedis.store.get('gemini:pool:cooldown:2');
    expect(cooldownEntry).toBeDefined();
    fakeRedis.store.set('gemini:pool:cooldown:2', {
      value: cooldownEntry!.value,
      expiresAt: Date.now() - 1,
    });

    const picks = new Set<number>();
    for (let i = 0; i < 8; i++) {
      const picked = await pool.pickKey();
      if (picked) picks.add(picked.index);
    }
    expect(picks.has(2)).toBe(true);
  });

  it('sets a PX TTL on the cooldown key matching cooldownMs', async () => {
    await pool.markRateLimited(0, 12_345);
    expect(fakeRedis.set).toHaveBeenCalledWith(
      'gemini:pool:cooldown:0',
      expect.anything(),
      'PX',
      12_345,
    );
  });
});

describe('earliestAvailableAt', () => {
  it('returns roughly "now" when at least one key has no cooldown', async () => {
    await pool.markRateLimited(0, 60_000);
    await pool.markRateLimited(1, 60_000);
    // indices 2 and 3 are free
    const before = Date.now();
    const at = await pool.earliestAvailableAt();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at - before).toBeLessThan(100);
  });

  it('returns the soonest cooldown expiry when every key is cooling', async () => {
    await pool.markRateLimited(0, 60_000);
    await pool.markRateLimited(1, 5_000);
    await pool.markRateLimited(2, 30_000);
    await pool.markRateLimited(3, 45_000);

    const before = Date.now();
    const at = await pool.earliestAvailableAt();
    // Should track index 1's 5s cooldown, not the pool-wide max.
    expect(at - before).toBeGreaterThan(4000);
    expect(at - before).toBeLessThan(6000);
  });

  it('never throws for a pool of size 0', async () => {
    state.keyPool = [];
    await expect(pool.earliestAvailableAt()).resolves.not.toThrow();
  });
});

describe('Redis outage fail-open', () => {
  beforeEach(() => {
    redisShouldFail = true;
  });

  it('pickKey falls back to a local round-robin cursor without throwing or hanging', async () => {
    const picks: number[] = [];
    for (let i = 0; i < 4; i++) {
      const picked = await pool.pickKey();
      expect(picked).not.toBeNull();
      picks.push(picked!.index);
    }
    // Degraded, but still correct and bounded: every index reachable, no crash.
    expect(new Set(picks).size).toBeGreaterThan(1);
  });

  it('markRateLimited never throws when Redis is unreachable', async () => {
    await expect(pool.markRateLimited(0, 5000)).resolves.toBeUndefined();
  });

  it('a key marked rate-limited during a Redis outage is still excluded via the local fallback map', async () => {
    await pool.markRateLimited(0, 60_000);
    for (let i = 0; i < 8; i++) {
      const picked = await pool.pickKey();
      expect(picked).not.toBeNull();
      expect(picked!.index).not.toBe(0);
    }
  });

  it('earliestAvailableAt never throws when Redis is unreachable', async () => {
    await pool.markRateLimited(0, 5000);
    await expect(pool.earliestAvailableAt()).resolves.toEqual(expect.any(Number));
  });
});

describe('pool of size 1', () => {
  beforeEach(() => {
    state.keyPool = ['solo-key'];
  });

  it('pickKey returns the sole key when not cooling', async () => {
    const picked = await pool.pickKey();
    expect(picked).toEqual({ index: 0, key: 'solo-key' });
  });

  it('pickKey returns null once the sole key is cooling', async () => {
    await pool.markRateLimited(0, 5000);
    const picked = await pool.pickKey();
    expect(picked).toBeNull();
  });

  it('does not perform a cursor INCR round trip for a single-key pool', async () => {
    await pool.pickKey();
    expect(fakeRedis.incr).not.toHaveBeenCalled();
  });
});
