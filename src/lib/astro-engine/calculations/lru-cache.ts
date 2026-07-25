// =============================================================================
// Generic bounded LRU cache — Map iteration order tracks recency.
// =============================================================================

export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxSize: number) {
    if (maxSize <= 0) {
      throw new Error('LruCache maxSize must be positive');
    }
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    // Re-insert to mark as most-recently-used.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);

    if (this.map.size > this.maxSize) {
      const oldestKey = this.map.keys().next().value as K;
      this.map.delete(oldestKey);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
