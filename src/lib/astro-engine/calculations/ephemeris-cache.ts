// =============================================================================
// Async compute cache: LRU-bounded results + in-flight de-duplication.
// Each instance owns one LruCache + one in-flight map — instances for
// different ephemeris functions (planet positions / houses / ascendant)
// must NOT share state, so construct a separate EphemerisCache per function.
// =============================================================================

import { LruCache } from './lru-cache.js';

export class EphemerisCache<V> {
  private readonly cache: LruCache<string, V>;
  private readonly inFlight = new Map<string, Promise<V>>();

  constructor(maxSize: number) {
    this.cache = new LruCache<string, V>(maxSize);
  }

  async get(key: string, compute: () => Promise<V>): Promise<V> {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = compute()
      .then((result) => {
        this.cache.set(key, result);
        return result;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  get size(): number {
    return this.cache.size;
  }
}
