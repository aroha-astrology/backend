import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression: GET /v1/admin/pass-stats 500'd in production. passStats put a bare
// Date inside a raw sql`` template. drizzle's postgres-js driver swaps the
// timestamptz serializer for a pass-through, so a Date that isn't bound to a
// column reaches postgres-js unconverted and its bind step throws. Column-bound
// operators (gte(col, date)) convert it to a string first. This runs the real
// drizzle driver over a fake client and checks what reaches the wire.
const state = vi.hoisted(() => ({ params: [] as unknown[][] }));

vi.mock('../src/config/db.js', async () => {
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const schema = await import('../src/db/schema.js');
  const unsafe = (_query: string, params: unknown[]) => {
    state.params.push(params);
    return Object.assign(Promise.resolve([]), { values: () => Promise.resolve([]) });
  };
  const client = { options: { parsers: {}, serializers: {} }, unsafe };
  return { db: drizzle(client as never, { schema }), sqlClient: client };
});

const { passStats, expireLapsedPasses } = await import('../src/modules/pass/pass.repo.js');

const now = new Date('2026-09-25T06:00:00Z');

beforeEach(() => {
  state.params = [];
});

describe('pass repo date params', () => {
  it('passStats sends no bare Date to the driver', async () => {
    const stats = await passStats(now);

    expect(state.params.length).toBeGreaterThan(0);
    expect(state.params.flat().filter((p) => p instanceof Date)).toEqual([]);
    expect(stats.endedOrCancelled30d).toBe(0);
  });

  it('expireLapsedPasses sends no bare Date to the driver', async () => {
    await expireLapsedPasses(now);

    const params = state.params.flat();
    expect(params.filter((p) => p instanceof Date)).toEqual([]);
    // The Play grace cutoff (3 days back) still goes out, as a string.
    expect(params).toContain(new Date(now.getTime() - 3 * 86_400_000).toISOString());
  });
});
