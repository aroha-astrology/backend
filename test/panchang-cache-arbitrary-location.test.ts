import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanchangCacheRow } from '../src/db/schema.js';

// In-memory stand-in for panchang_cache, keyed the same way the real repo
// keys rows: (forDate, refKey). Lets us assert the SECOND getPanchang() call
// for an arbitrary (non-reference-point) lat/lon hits this cache instead of
// recomputing — proving Task 6.5's fix (every location caches, not just the
// 5 named reference points) without needing a live Postgres in tests.
const state = vi.hoisted(() => ({
  store: new Map<string, { lat: number; lon: number; data: unknown }>(),
  findCachedPanchang: vi.fn(),
  upsertCachedPanchang: vi.fn(),
}));

vi.mock('../src/modules/astro/panchang-cache.repo.js', () => ({
  findCachedPanchang: state.findCachedPanchang,
  upsertCachedPanchang: state.upsertCachedPanchang,
}));

const { getPanchang } = await import('../src/modules/astro/astro.service.js');
const { roundCoordToLocationKey } =
  await import('../src/lib/astro-tools/panchang-reference-points.js');

beforeEach(() => {
  state.store.clear();
  state.findCachedPanchang.mockReset().mockImplementation((forDate: string, refKey: string) => {
    const row = state.store.get(`${forDate}|${refKey}`);
    return Promise.resolve(row ? ({ data: row.data } as PanchangCacheRow) : undefined);
  });
  state.upsertCachedPanchang
    .mockReset()
    .mockImplementation(
      (params: { forDate: string; refKey: string; lat: number; lon: number; data: unknown }) => {
        state.store.set(`${params.forDate}|${params.refKey}`, {
          lat: params.lat,
          lon: params.lon,
          data: params.data,
        });
        return Promise.resolve();
      },
    );
});

describe('getPanchang caching for arbitrary (non-reference-point) locations', () => {
  // Guwahati — deliberately far from all 5 named reference points (see
  // panchang-reference-points.spec.ts, which asserts this exact coordinate
  // snaps to null).
  const lat = 26.18;
  const lon = 91.75;
  const date = '2026-07-04';

  it('caches on the rounded-coordinate key and hits the cache on a repeat call', async () => {
    const first = await getPanchang(lat, lon, date);

    // First call: a miss, then a write — exactly one row persisted.
    expect(state.upsertCachedPanchang).toHaveBeenCalledTimes(1);
    expect(state.store.size).toBe(1);
    const expectedKey = roundCoordToLocationKey(lat, lon);
    expect(state.store.has(`${date}|${expectedKey}`)).toBe(true);

    const second = await getPanchang(lat, lon, date);

    // Second call: served from the cache — no additional write, and the
    // payload returned is identical.
    expect(state.upsertCachedPanchang).toHaveBeenCalledTimes(1);
    expect(state.findCachedPanchang).toHaveBeenCalledTimes(2);
    expect(state.store.size).toBe(1);
    expect(second).toEqual(first);
  }, 20_000);
});
