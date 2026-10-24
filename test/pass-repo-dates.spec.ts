import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression: GET /v1/admin/pass-stats 500'd in production. passStats put a bare
// Date inside a raw sql`` template. drizzle's postgres-js driver swaps the
// timestamptz serializer for a pass-through, so a Date that isn't bound to a
// column reaches postgres-js unconverted and its bind step throws. Column-bound
// operators (gte(col, date)) convert it to a string first. This runs the real
// drizzle driver over a fake client and checks what reaches the wire.
const state = vi.hoisted(() => ({ params: [] as unknown[][], queries: [] as string[] }));

vi.mock('../src/config/db.js', async () => {
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const schema = await import('../src/db/schema.js');
  const unsafe = (query: string, params: unknown[]) => {
    state.params.push(params);
    state.queries.push(query);
    return Object.assign(Promise.resolve([]), { values: () => Promise.resolve([]) });
  };
  const client = { options: { parsers: {}, serializers: {} }, unsafe };
  return { db: drizzle(client as never, { schema }), sqlClient: client };
});

const {
  passStats,
  expireLapsedPasses,
  listPlayPassesToReconcile,
  findLapsedPlayPass,
  listRenewingPlayPasses,
} = await import('../src/modules/pass/pass.repo.js');

const now = new Date('2026-09-25T06:00:00Z');

beforeEach(() => {
  state.params = [];
  state.queries = [];
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
    // A Play Pass is never ended on its date alone: only Google (the reconcile) ends it.
    expect(params).toContain('google_play');
    expect(state.queries.join('\n')).toMatch(/not "user_subscriptions"\."source" in \(\$\d+, \$\d+, \$\d+\)/);
  });

  it('the Play reconcile, on-demand and deletion queries send no bare Date to the driver', async () => {
    await listPlayPassesToReconcile(now, 500);
    await findLapsedPlayPass('user-1', now, new Date(now.getTime() - 600_000));
    await listRenewingPlayPasses('user-1');

    const params = state.params.flat();
    expect(params.filter((p) => p instanceof Date)).toEqual([]);
    // The hour-ahead window, the 50-minute re-check and the 65-day watch all go out as strings.
    expect(params).toContain(new Date(now.getTime() + 3_600_000).toISOString());
    expect(params).toContain(new Date(now.getTime() - 50 * 60_000).toISOString());
    expect(params).toContain(new Date(now.getTime() - 65 * 86_400_000).toISOString());
    expect(params).toContain('SUBSCRIPTION_STATE_IN_GRACE_PERIOD');
    expect(params).toContain('SUBSCRIPTION_STATE_ON_HOLD');
  });
});
