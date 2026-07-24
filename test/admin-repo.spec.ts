import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  insert: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { insert: state.insert }, sqlClient };
});

import { logAdminAction } from '../src/modules/admin/admin.repo.js';

interface FakeInsertChain {
  values: (v: unknown) => Promise<void>;
}
function makeInsertChain() {
  const calls: { values?: unknown } = {};
  const chain: FakeInsertChain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return Promise.resolve(undefined);
    }),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.insert.mockReset();
});

describe('logAdminAction', () => {
  it('inserts one admin_audit_log row with the given fields', async () => {
    const { chain, calls } = makeInsertChain();
    state.insert.mockReturnValue(chain);

    await logAdminAction({
      adminFirebaseUid: 'admin-uid-1',
      route: 'GET /v1/admin/users/:phone/inspect',
      params: { phone: '+919999999999' },
    });

    expect(state.insert).toHaveBeenCalledTimes(1);
    expect(calls.values).toEqual({
      adminFirebaseUid: 'admin-uid-1',
      route: 'GET /v1/admin/users/:phone/inspect',
      params: { phone: '+919999999999' },
    });
  });
});
