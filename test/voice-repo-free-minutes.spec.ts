import { beforeEach, describe, expect, it, vi } from 'vitest';

// The free Pass minutes are enforced in SQL, in the WHERE clause of the UPDATE
// that claims a minute — the service only sees a row or null. So what matters
// is the statement that reaches the database. This runs the real drizzle
// driver over a fake client (same approach as pass-repo-dates.spec.ts) and
// checks the query text and its parameters.
const state = vi.hoisted(() => ({
  calls: [] as { query: string; params: unknown[] }[],
  rows: [] as unknown[][],
}));

vi.mock('../src/config/db.js', async () => {
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const schema = await import('../src/db/schema.js');
  const unsafe = (query: string, params: unknown[]) => {
    state.calls.push({ query, params });
    const rows = state.rows.shift() ?? [];
    return Object.assign(Promise.resolve(rows), { values: () => Promise.resolve(rows) });
  };
  const client = { options: { parsers: {}, serializers: {} }, unsafe };
  return { db: drizzle(client as never, { schema }), sqlClient: client };
});

const {
  claimFreeVoiceMinute,
  countFreeVoiceMinutesUsed,
  releaseVoiceMinute,
  endVoiceSessionWithRefund,
} = await import('../src/modules/voice/voice.repo.js');

const SESSION = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const SINCE = new Date('2026-10-01T00:00:00Z');

beforeEach(() => {
  state.calls = [];
  state.rows = [];
});

describe('claimFreeVoiceMinute', () => {
  it('claims the minute only while the period allowance is not used up', async () => {
    await claimFreeVoiceMinute(SESSION, USER, 60, SINCE, 3);

    expect(state.calls).toHaveLength(1);
    const { query, params } = state.calls[0]!;
    expect(query).toMatch(/^update "voice_sessions"/);
    expect(query).toContain('"free_minutes" = "voice_sessions"."free_minutes" + 1');
    expect(query).toContain('"minutes_charged" = "voice_sessions"."minutes_charged" + 1');
    // The allowance is a sum over ALL of the user's sessions since the period
    // began, compared inside the same statement that takes the minute.
    expect(query).toMatch(
      /\(select coalesce\(sum\("free_minutes"\), 0\) from "voice_sessions" where \("voice_sessions"\."user_id" = \$\d+ and "voice_sessions"\."created_at" >= \$\d+\)\)\) < \$\d+/,
    );
    expect(query).toContain('"voice_sessions"."active" = $');
    expect(params).toContain(3);
    expect(params).toContain(60);
  });

  it('sends the period start as a string, never a bare Date', async () => {
    await claimFreeVoiceMinute(SESSION, USER, 60, SINCE, 3);

    const params = state.calls[0]!.params;
    expect(params.filter((p) => p instanceof Date && p.getTime() === SINCE.getTime())).toEqual([]);
    expect(params).toContain(SINCE.toISOString());
  });
});

describe('countFreeVoiceMinutesUsed', () => {
  it('reads the sum as a number', async () => {
    // Postgres returns sum() as a string, and drizzle reads selects as value rows.
    state.rows = [[['2']]];

    expect(await countFreeVoiceMinutesUsed(USER, SINCE)).toBe(2);
  });

  it('is zero for a member who has not called this period', async () => {
    state.rows = [[['0']]];

    expect(await countFreeVoiceMinutesUsed(USER, SINCE)).toBe(0);
  });
});

describe('releaseVoiceMinute', () => {
  it('leaves the free count alone for a wallet minute', async () => {
    await releaseVoiceMinute(SESSION, USER);

    expect(state.calls[0]!.query).not.toContain('"free_minutes"');
  });

  it('hands a free minute back to the allowance', async () => {
    await releaseVoiceMinute(SESSION, USER, true);

    expect(state.calls[0]!.query).toContain(
      '"free_minutes" = greatest("voice_sessions"."free_minutes" - 1, 0)',
    );
  });
});

describe('endVoiceSessionWithRefund', () => {
  it('treats the minute as free only when every minute of the call so far was free', async () => {
    state.rows = [[{ id: SESSION }]];

    const refund = await endVoiceSessionWithRefund(SESSION, USER, 15_000);

    expect(refund).toEqual({ refundedMinutes: 1, free: true });
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]!.query).toContain(
      '"voice_sessions"."free_minutes" = "voice_sessions"."minutes_charged"',
    );
  });

  it('falls through to a wallet refund when the latest minute was paid for', async () => {
    state.rows = [[], [{ id: SESSION }]];

    const refund = await endVoiceSessionWithRefund(SESSION, USER, 15_000);

    expect(refund).toEqual({ refundedMinutes: 1, free: false });
    expect(state.calls).toHaveLength(2);
    expect(state.calls[1]!.query).not.toContain('"free_minutes" =');
  });

  it('refunds nothing outside the grace window or once the call has ended', async () => {
    state.rows = [[], []];

    expect(await endVoiceSessionWithRefund(SESSION, USER, 15_000)).toBeNull();
  });
});
