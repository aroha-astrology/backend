import { describe, it, expect, vi } from 'vitest';
import { EphemerisCache } from '../src/lib/astro-engine/calculations/ephemeris-cache.js';

describe('EphemerisCache', () => {
  it('caches the result of compute() for a given key', async () => {
    const cache = new EphemerisCache<number>(10);
    const compute = vi.fn().mockResolvedValue(42);

    const first = await cache.get('k1', compute);
    const second = await cache.get('k1', compute);

    expect(first).toBe(42);
    expect(second).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('computes independently for different keys', async () => {
    const cache = new EphemerisCache<number>(10);
    const compute = vi.fn().mockImplementation(() => Promise.resolve(Math.random()));

    const a = await cache.get('k1', compute);
    const b = await cache.get('k2', compute);

    expect(a).not.toBe(b);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('de-duplicates concurrent calls for the same key into one compute() call', async () => {
    const cache = new EphemerisCache<number>(10);
    let resolveCompute!: (v: number) => void;
    const compute = vi.fn().mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolveCompute = resolve;
        }),
    );

    const p1 = cache.get('k1', compute);
    const p2 = cache.get('k1', compute);
    resolveCompute(7);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(7);
    expect(r2).toBe(7);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('does not cache a rejected compute(), so the next call retries', async () => {
    const cache = new EphemerisCache<number>(10);
    const compute = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(99);

    await expect(cache.get('k1', compute)).rejects.toThrow('boom');
    const result = await cache.get('k1', compute);

    expect(result).toBe(99);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
