import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// revokeTokensByValue is FCM's dead-token pruning hook: sendPushBatch (fcm.ts)
// calls it with tokens FCM reports as permanently unregistered so they stop
// being retried on every future broadcast. See
// aroha-fcm-dead-token-pruning-gap-2026-07-25.

const state = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { update: state.update }, sqlClient };
});

import { devicePushTokens } from '../src/db/schema.js';
import { revokeTokensByValue } from '../src/modules/device-tokens/device-tokens.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeUpdateChain {
  set: (patch: unknown) => FakeUpdateChain;
  where: (cond: unknown) => Promise<unknown>;
}

function makeUpdateChain() {
  const calls: { set?: unknown; where?: unknown } = {};
  const chain: FakeUpdateChain = {
    set: vi.fn((patch: unknown) => {
      calls.set = patch;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return Promise.resolve(undefined);
    }),
  };
  return { chain, calls };
}

describe('revokeTokensByValue — bulk-revoke dead FCM tokens by token string', () => {
  beforeEach(() => {
    state.update.mockReset();
  });

  it('sets revokedAt/updatedAt for the given tokens, scoped to still-active rows', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    await revokeTokensByValue(['tok-dead-1', 'tok-dead-2']);

    expect(state.update).toHaveBeenCalledWith(devicePushTokens);
    expect((calls.set as any).revokedAt).toBeInstanceOf(Date);
    expect((calls.set as any).updatedAt).toBeInstanceOf(Date);

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("device_push_tokens"."token" in ($1, $2) and "device_push_tokens"."revoked_at" is null)',
    );
    expect(query.params).toEqual(['tok-dead-1', 'tok-dead-2']);
  });

  it('does not touch the database when given an empty list', async () => {
    await revokeTokensByValue([]);

    expect(state.update).not.toHaveBeenCalled();
  });
});
