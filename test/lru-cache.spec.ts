import { describe, it, expect } from 'vitest';
import { LruCache } from '../src/lib/astro-engine/calculations/lru-cache.js';

describe('LruCache', () => {
  it('returns undefined for a missing key', () => {
    const cache = new LruCache<string, number>(2);
    expect(cache.get('a')).toBeUndefined();
  });

  it('stores and retrieves a value', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.size).toBe(1);
  });

  it('evicts the least-recently-used entry once over capacity', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // capacity 2 -> 'a' should be evicted
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('a get() refreshes recency, protecting the key from eviction', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // 'a' is now most-recently-used
    cache.set('c', 3); // 'b' should be evicted instead of 'a'
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });
});
