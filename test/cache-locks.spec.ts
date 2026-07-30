import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * A `SET key owner EX ttl NX` stand-in — the one Redis behaviour `acquire()`
 * actually depends on. `throwOnNextSet` simulates an unreachable Redis, which
 * is the case this suite exists for: the difference between "someone else holds
 * this" and "Redis is down" is what decides whether a Redis blip paces one
 * duplicate request or locks every user out of the feature entirely.
 */
const store = new Map<string, string>();
let throwOnNextSet = false;
let throwOnNextExists = false;

vi.mock('../src/config/redis.js', () => ({
  getRedis: () => ({
    set: (key: string, owner: string, _ex: string, _ttl: number, _nx: string) => {
      if (throwOnNextSet) return Promise.reject(new Error('ECONNREFUSED'));
      if (store.has(key)) return Promise.resolve(null);
      store.set(key, owner);
      return Promise.resolve('OK');
    },
    eval: (_script: string, _numKeys: number, key: string, owner: string) => {
      if (store.get(key) !== owner) return Promise.resolve(0);
      store.delete(key);
      return Promise.resolve(1);
    },
    exists: (key: string) => {
      if (throwOnNextExists) return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve(store.has(key) ? 1 : 0);
    },
  }),
}));

const { acquire, release, isLocked } = await import('../src/lib/cache/locks.js');

beforeEach(() => {
  store.clear();
  throwOnNextSet = false;
  throwOnNextExists = false;
});

describe('acquire', () => {
  it('grants the lock to the first caller and reports it held for the second', async () => {
    const first = await acquire('chat:inflight', 'user-1');
    expect(first).toEqual({ ok: true, owner: expect.any(String) });

    const second = await acquire('chat:inflight', 'user-1');
    expect(second).toEqual({ ok: false, reason: 'held' });
  });

  it('scopes locks per id, so one user never blocks another', async () => {
    await acquire('chat:inflight', 'user-1');
    const otherUser = await acquire('chat:inflight', 'user-2');
    expect(otherUser.ok).toBe(true);
  });

  it('scopes locks per prefix, so chat and voice do not share one', async () => {
    await acquire('chat:inflight', 'user-1');
    const voice = await acquire('voice:inflight', 'user-1');
    expect(voice.ok).toBe(true);
  });

  it('distinguishes an unreachable Redis from a genuinely held lock', async () => {
    // The whole point of the discriminated result. Callers that pace user
    // requests reject only on 'held' — collapsing both into one falsy value is
    // what turns a Redis blip into a full outage of the guarded feature.
    throwOnNextSet = true;
    const result = await acquire('chat:inflight', 'user-1');
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('issues a distinct owner per acquisition', async () => {
    const first = await acquire('chat:inflight', 'user-1');
    await release('chat:inflight', 'user-1', first.ok ? first.owner : '');
    const second = await acquire('chat:inflight', 'user-1');

    expect(first.ok && second.ok && first.owner).not.toBe(second.ok && second.owner);
  });
});

describe('release', () => {
  it('frees the lock for the next caller', async () => {
    const held = await acquire('chat:inflight', 'user-1');
    expect(held.ok).toBe(true);

    await release('chat:inflight', 'user-1', held.ok ? held.owner : '');

    const reacquired = await acquire('chat:inflight', 'user-1');
    expect(reacquired.ok).toBe(true);
  });

  it('refuses to release a lock owned by someone else', async () => {
    // Guards the case where a lock expired and was re-taken by another request
    // mid-flight: the original holder finishing later must not free the new
    // owner's lock.
    await acquire('chat:inflight', 'user-1');
    const released = await release('chat:inflight', 'user-1', 'some-other-owner');

    expect(released).toBe(false);
    expect(await isLocked('chat:inflight', 'user-1')).toBe(true);
  });
});

describe('isLocked', () => {
  it('fails CLOSED when Redis is unreachable', async () => {
    // Deliberately the opposite trade from acquire(): isLocked guards critical
    // sections where running twice is worse than not running at all.
    throwOnNextExists = true;
    expect(await isLocked('chat:inflight', 'user-1')).toBe(true);
  });
});
