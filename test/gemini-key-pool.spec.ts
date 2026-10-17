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
  paidKeyPool: [] as string[],
  // Per paid key, parallel to paidKeyPool; missing entries default (name paid-N, rank N, on).
  paidKeyNames: [] as string[],
  paidRanks: [] as number[],
  // Keys (by key string) switched off on Admin -> Gemini Keys.
  disabled: new Set<string>(),
}));

// Stands in for .env + the gemini_keys table. Fingerprint = 'fp-' + key, so a
// cooldown on key 'key-2' lives at 'gemini:pool:cooldown:fp-key-2'.
vi.mock('../src/lib/llm/gemini-keys.js', () => {
  const build = () => [
    ...state.keyPool.map((key, i) => ({
      fingerprint: `fp-${key}`,
      name: `free-${i + 1}`,
      tier: 'free' as const,
      key,
      enabled: !state.disabled.has(key),
      paidRank: 100,
      source: 'env' as const,
    })),
    ...state.paidKeyPool.map((key, i) => ({
      fingerprint: `fp-${key}`,
      name: state.paidKeyNames[i] ?? `paid-${i}`,
      tier: 'paid' as const,
      key,
      enabled: !state.disabled.has(key),
      paidRank: state.paidRanks[i] ?? i,
      source: 'env' as const,
    })),
  ];
  return {
    loadGeminiKeys: () => Promise.resolve(build()),
    cachedGeminiKeys: () => build(),
  };
});

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
  state.paidKeyPool = [];
  state.paidKeyNames = [];
  state.paidRanks = [];
  state.disabled = new Set();
  fakeRedis = createFakeRedis();
  redisShouldFail = false;
  // Reset the module's local (in-process fallback) state between tests too,
  // since it's module-scoped and would otherwise leak across cases.
  pool.__resetForTests();
});

describe('poolSize', () => {
  it('reflects the number of keys', async () => {
    expect(pool.poolSize()).toBe(4);
    state.keyPool = ['only-one'];
    await pool.pickKey();
    expect(pool.poolSize()).toBe(1);
  });

  it('leaves switched-off keys out', async () => {
    state.disabled = new Set(['key-1']);
    await pool.pickKey();
    expect(pool.poolSize()).toBe(3);
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
    const cooldownEntry = fakeRedis.store.get('gemini:pool:cooldown:fp-key-2');
    expect(cooldownEntry).toBeDefined();
    fakeRedis.store.set('gemini:pool:cooldown:fp-key-2', {
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
      'gemini:pool:cooldown:fp-key-0',
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
    pool.__resetForTests();
  });

  it('pickKey returns the sole key when not cooling', async () => {
    const picked = await pool.pickKey();
    expect(picked).toEqual({ index: 0, key: 'solo-key', tier: 'free' });
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

describe('paid reserve tier', () => {
  // Two free keys + one paid reserve key. The paid key is flat index 2.
  const PAID_INDEX = 2;

  beforeEach(() => {
    state.keyPool = ['free-0', 'free-1'];
    state.paidKeyPool = ['paid-key'];
    pool.__resetForTests();
  });

  it('counts both tiers in poolSize, so the client failover budget reaches the reserve', () => {
    expect(pool.poolSize()).toBe(3);
  });

  it('labels each index with its tier', () => {
    expect(pool.tierAt(0)).toBe('free');
    expect(pool.tierAt(1)).toBe('free');
    expect(pool.tierAt(PAID_INDEX)).toBe('paid');
  });

  it('never hands out the paid key while any free key is usable', async () => {
    for (let i = 0; i < 20; i++) {
      const picked = await pool.pickKey();
      expect(picked).not.toBeNull();
      expect(picked!.tier).toBe('free');
      expect(picked!.index).not.toBe(PAID_INDEX);
    }
  });

  it('still withholds the paid key when only ONE free key is left cooling', async () => {
    await pool.markRateLimited(0, 60_000);
    const picked = await pool.pickKey();
    expect(picked).toEqual({ index: 1, key: 'free-1', tier: 'free' });
  });

  it('hands out the paid key once every free key is cooling down', async () => {
    await pool.markRateLimited(0, 60_000);
    await pool.markRateLimited(1, 60_000);

    const picked = await pool.pickKey();
    expect(picked).toEqual({ index: PAID_INDEX, key: 'paid-key', tier: 'paid' });
  });

  it('hands out the paid key when every free key was already tried this attempt', async () => {
    // The client's inner failover loop excludes keys it has already 429'd on
    // within a single attempt — that must reach the reserve too, not give up.
    const picked = await pool.pickKey(new Set([0, 1]));
    expect(picked).toEqual({ index: PAID_INDEX, key: 'paid-key', tier: 'paid' });
  });

  it('preferPaid reaches the reserve even with every free key healthy', async () => {
    // The last-attempt escalation in gemini-client.ts: three attempts have
    // already failed on the free tier for a reason that never sets a cooldown
    // (a 503, a timeout), so free keys still look perfectly usable. Without
    // this the reserve stayed idle while the request failed the user.
    const picked = await pool.pickKey(new Set(), true);
    expect(picked).toEqual({ index: PAID_INDEX, key: 'paid-key', tier: 'paid' });
  });

  it('preferPaid falls back to a free key when the reserve is cooling', async () => {
    await pool.markRateLimited(PAID_INDEX, 60_000);
    const picked = await pool.pickKey(new Set(), true);
    expect(picked!.tier).toBe('free');
  });

  it('preferPaid falls back to the free tier when no reserve is configured', async () => {
    // A deployment with GEMINI_PAID_KEY_POOL unset must not turn its last
    // attempt into "no key at all" — that would fail requests the free pool
    // could still serve.
    state.paidKeyPool = [];
    const picked = await pool.pickKey(new Set(), true);
    expect(picked).not.toBeNull();
    expect(picked!.tier).toBe('free');
  });

  it('goes back to the free tier as soon as one free cooldown expires', async () => {
    await pool.markRateLimited(0, 60_000);
    await pool.markRateLimited(1, 1000);
    expect((await pool.pickKey())!.tier).toBe('paid');

    // Age out index 1's cooldown the same way the round-robin suite does.
    const entry = fakeRedis.store.get('gemini:pool:cooldown:fp-free-1');
    fakeRedis.store.set('gemini:pool:cooldown:fp-free-1', {
      value: entry!.value,
      expiresAt: Date.now() - 1,
    });

    const picked = await pool.pickKey();
    expect(picked).toEqual({ index: 1, key: 'free-1', tier: 'free' });
  });

  it('returns null only when the paid reserve is cooling too', async () => {
    await pool.markRateLimited(0, 60_000);
    await pool.markRateLimited(1, 60_000);
    expect(await pool.pickKey()).not.toBeNull();

    await pool.markRateLimited(PAID_INDEX, 60_000);
    expect(await pool.pickKey()).toBeNull();
  });

  it('keeps the paid key out of the round-robin cursor', async () => {
    // Ten picks across two free keys must split evenly. If the reserve were
    // part of the rotation the cursor would land on it roughly a third of the
    // time and we would be billing during normal operation.
    const picks: number[] = [];
    for (let i = 0; i < 10; i++) {
      picks.push((await pool.pickKey())!.index);
    }
    expect(picks.filter((p) => p === 0)).toHaveLength(5);
    expect(picks.filter((p) => p === 1)).toHaveLength(5);
  });

  it('does not consult the cursor at all when there is a single free key plus a reserve', async () => {
    state.keyPool = ['solo-free'];
    await pool.pickKey();
    expect(fakeRedis.incr).not.toHaveBeenCalled();
  });

  it('falls through to the reserve during a Redis outage via the local cooldown map', async () => {
    redisShouldFail = true;
    await pool.markRateLimited(0, 60_000);
    await pool.markRateLimited(1, 60_000);

    const picked = await pool.pickKey();
    expect(picked).toEqual({ index: PAID_INDEX, key: 'paid-key', tier: 'paid' });
  });

  it('behaves exactly as before when no paid key is configured', async () => {
    state.paidKeyPool = [];
    await pool.markRateLimited(0, 60_000);
    await pool.markRateLimited(1, 60_000);
    expect(await pool.pickKey()).toBeNull();
  });
});

describe('paid keys in the admin-set order', () => {
  // 0-1 free. Paid keys sort by paid rank: subir2 (rank 0, as .env gives it) at
  // index 2, subir1719 (rank 1) at index 3, until the admin reorders them.
  beforeEach(() => {
    state.keyPool = ['free-0', 'free-1'];
    state.paidKeyPool = ['paid-1719', 'paid-2'];
    state.paidKeyNames = ['subir1719', 'subir2'];
    state.paidRanks = [1, 0];
    pool.__resetForTests();
  });

  it('uses subir2 first by default', async () => {
    expect(await pool.pickKey(new Set(), true)).toEqual({ index: 2, key: 'paid-2', tier: 'paid' });
  });

  it('uses subir1719 first once the admin ranks it first', async () => {
    state.paidRanks = [0, 1];
    expect(await pool.pickKey(new Set(), true)).toEqual({
      index: 2,
      key: 'paid-1719',
      tier: 'paid',
    });
  });

  it('follows the order when the free keys run out, not only on preferPaid', async () => {
    await pool.markRateLimited(0, 60_000);
    await pool.markRateLimited(1, 60_000);
    expect((await pool.pickKey())!.key).toBe('paid-2');
  });

  it('falls over to the next paid key when the first one is cooling', async () => {
    await pool.markRateLimited(2, 60_000);
    expect((await pool.pickKey(new Set(), true))!.key).toBe('paid-1719');
  });

  it('keeps a cooldown on the same key after the admin reorders the keys', async () => {
    await pool.markRateLimited(2, 60_000); // subir2
    state.paidRanks = [0, 1]; // subir1719 first now; subir2 moves to index 3
    const picked = await pool.pickKey(new Set(), true);
    expect(picked!.key).toBe('paid-1719');
    // subir2 is still cooling, so with subir1719 excluded the reserve has nothing left.
    expect(await pool.pickKey(new Set([0, 1, 2]), true)).toBeNull();
  });

  it('never hands out a switched-off key', async () => {
    state.disabled = new Set(['paid-2']);
    expect((await pool.pickKey(new Set(), true))!.key).toBe('paid-1719');
    state.disabled = new Set(['free-0', 'free-1']);
    expect((await pool.pickKey())!.key).toBe('paid-2');
  });

  it('still spends free keys before any paid key', async () => {
    expect((await pool.pickKey())!.tier).toBe('free');
  });

  it('names each paid index, and none for a free one', async () => {
    await pool.pickKey();
    expect(pool.paidKeyNameAt(0)).toBeNull();
    expect(pool.paidKeyNameAt(2)).toBe('subir2');
    expect(pool.paidKeyNameAt(3)).toBe('subir1719');
  });
});
