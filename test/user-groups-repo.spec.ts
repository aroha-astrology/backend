import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Same drizzle-chain-stubbing idiom as test/admin-repo.spec.ts / test/profiles-repo.spec.ts:
// stub the db.select/insert/delete chain methods directly rather than hitting a real database.
const state = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select, insert: state.insert, delete: state.delete }, sqlClient };
});

vi.mock('../src/lib/crypto/field-encryption.js', () => ({
  decryptField: vi.fn((v: string | null) => (v === null ? null : `decrypted:${v}`)),
}));

import {
  userGroups,
  userGroupMembers,
  featureFlagGroupOverrides,
} from '../src/db/schema.js';
import {
  createGroup,
  listGroups,
  listGroupsWithMemberCount,
  deleteGroup,
  addMember,
  removeMember,
  listMembers,
  listGroupIdsForUser,
  upsertGroupFeatureOverride,
  deleteGroupFeatureOverride,
  listGroupFeatureOverrides,
  listAllGroupFeatureOverrides,
} from '../src/modules/user-groups/user-groups.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

/* -------------------------------------------------------------------------- */
/* Fake chain builders                                                        */
/* -------------------------------------------------------------------------- */

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  innerJoin: (table: unknown, cond: unknown) => FakeSelectChain;
  leftJoin: (table: unknown, cond: unknown) => FakeSelectChain;
  groupBy: (expr: unknown) => FakeSelectChain;
  orderBy: (expr: unknown) => FakeSelectChain;
  limit: (n: number) => FakeSelectChain;
  offset: (n: number) => FakeSelectChain;
  then: (resolve: (value: unknown) => void) => void;
}

function makeSelectChain(result: unknown[]) {
  const calls: {
    from?: unknown;
    where?: unknown;
    innerJoin?: [unknown, unknown];
    leftJoin?: [unknown, unknown];
    groupBy?: unknown;
    orderBy?: unknown;
  } = {};
  const chain: FakeSelectChain = {
    from: vi.fn((table: unknown) => {
      calls.from = table;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    innerJoin: vi.fn((table: unknown, cond: unknown) => {
      calls.innerJoin = [table, cond];
      return chain;
    }),
    leftJoin: vi.fn((table: unknown, cond: unknown) => {
      calls.leftJoin = [table, cond];
      return chain;
    }),
    groupBy: vi.fn((expr: unknown) => {
      calls.groupBy = expr;
      return chain;
    }),
    orderBy: vi.fn((expr: unknown) => {
      calls.orderBy = expr;
      return chain;
    }),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  return { chain, calls };
}

interface FakeInsertChain {
  values: (v: unknown) => FakeInsertChain;
  onConflictDoNothing: (config?: unknown) => FakeInsertChain;
  onConflictDoUpdate: (config: unknown) => FakeInsertChain;
  returning: () => Promise<unknown[]>;
  then: (resolve: (value: unknown) => void) => void;
}

function makeInsertChain(returningResult: unknown[]) {
  const calls: { values?: unknown; onConflictDoNothing?: unknown; onConflictDoUpdate?: unknown } = {};
  const chain: FakeInsertChain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return chain;
    }),
    onConflictDoNothing: vi.fn((config?: unknown) => {
      calls.onConflictDoNothing = config;
      return chain;
    }),
    onConflictDoUpdate: vi.fn((config: unknown) => {
      calls.onConflictDoUpdate = config;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(returningResult)),
    then: (resolve: (value: unknown) => void) => resolve(returningResult),
  };
  return { chain, calls };
}

interface FakeDeleteChain {
  where: (cond: unknown) => FakeDeleteChain;
  returning: () => Promise<unknown[]>;
  then: (resolve: (value: unknown) => void) => void;
}

function makeDeleteChain(returningResult: unknown[] = []) {
  const calls: { where?: unknown } = {};
  const chain: FakeDeleteChain = {
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(returningResult)),
    then: (resolve: (value: unknown) => void) => resolve(returningResult),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
  state.delete.mockReset();
});

/* -------------------------------------------------------------------------- */
/* Groups                                                                     */
/* -------------------------------------------------------------------------- */

describe('createGroup', () => {
  it('inserts a new group row with name/description/createdBy and returns it', async () => {
    const returned = {
      id: 'group-1',
      name: 'Beta testers',
      description: 'Hand-picked early access list',
      createdAt: new Date(),
      createdBy: '+919999111111',
    };
    const { chain, calls } = makeInsertChain([returned]);
    state.insert.mockReturnValue(chain);

    const result = await createGroup('Beta testers', 'Hand-picked early access list', '+919999111111');

    expect(state.insert).toHaveBeenCalledWith(userGroups);
    expect(calls.values).toMatchObject({
      name: 'Beta testers',
      description: 'Hand-picked early access list',
      createdBy: '+919999111111',
    });
    expect(result).toEqual(returned);
  });

  it('passes a null description through untouched', async () => {
    const returned = {
      id: 'group-2',
      name: 'Cost-sensitive cohort',
      description: null,
      createdAt: new Date(),
      createdBy: '+919999111111',
    };
    const { chain, calls } = makeInsertChain([returned]);
    state.insert.mockReturnValue(chain);

    await createGroup('Cost-sensitive cohort', null, '+919999111111');

    expect(calls.values).toMatchObject({ description: null });
  });
});

describe('listGroups', () => {
  it('selects every row from user_groups', async () => {
    const rows = [{ id: 'g1', name: 'A', description: null, createdAt: new Date(), createdBy: null }];
    const { chain, calls } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await listGroups();

    expect(state.select).toHaveBeenCalled();
    expect(calls.from).toBe(userGroups);
    expect(result).toEqual(rows);
  });
});

describe('listGroupsWithMemberCount', () => {
  it('left-joins user_group_members and returns each group with its member count', async () => {
    const rows = [
      { id: 'g1', name: 'Beta', description: null, createdAt: new Date(), createdBy: null, memberCount: 3 },
      { id: 'g2', name: 'VIP', description: null, createdAt: new Date(), createdBy: null, memberCount: 0 },
    ];
    const { chain, calls } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await listGroupsWithMemberCount();

    expect(calls.from).toBe(userGroups);
    expect(calls.leftJoin?.[0]).toBe(userGroupMembers);
    expect(calls.groupBy).toBeDefined();
    expect(result).toEqual([
      { id: 'g1', name: 'Beta', description: null, createdAt: rows[0]!.createdAt, createdBy: null, memberCount: 3 },
      { id: 'g2', name: 'VIP', description: null, createdAt: rows[1]!.createdAt, createdBy: null, memberCount: 0 },
    ]);
  });

  it('coerces a group with zero members (left join produces count 0, not null)', async () => {
    const rows = [
      { id: 'g1', name: 'Empty', description: null, createdAt: new Date(), createdBy: null, memberCount: '0' },
    ];
    const { chain } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await listGroupsWithMemberCount();

    expect(result[0]!.memberCount).toBe(0);
  });
});

describe('deleteGroup', () => {
  it('deletes the group row by id (members/overrides cascade via FK)', async () => {
    const { chain, calls } = makeDeleteChain([]);
    state.delete.mockReturnValue(chain);

    await deleteGroup('group-1');

    expect(state.delete).toHaveBeenCalledWith(userGroups);
    const query = compile(calls.where);
    expect(query.sql).toMatch(/user_groups.*id/);
    expect(query.params).toEqual(['group-1']);
  });
});

/* -------------------------------------------------------------------------- */
/* Members                                                                    */
/* -------------------------------------------------------------------------- */

describe('addMember', () => {
  it('inserts idempotently via onConflictDoNothing on the composite (group_id, user_id) PK', async () => {
    const { chain, calls } = makeInsertChain([]);
    state.insert.mockReturnValue(chain);

    await addMember('group-1', 'user-1');

    expect(state.insert).toHaveBeenCalledWith(userGroupMembers);
    expect(calls.values).toMatchObject({ groupId: 'group-1', userId: 'user-1' });
    expect(calls.onConflictDoNothing).toBeDefined();
  });

  it('does not throw when called twice for the same pair (idempotent)', async () => {
    const { chain } = makeInsertChain([]);
    state.insert.mockReturnValue(chain);

    await expect(addMember('group-1', 'user-1')).resolves.not.toThrow();
    await expect(addMember('group-1', 'user-1')).resolves.not.toThrow();
  });
});

describe('removeMember', () => {
  it('deletes the membership row scoped to both group_id and user_id', async () => {
    const { chain, calls } = makeDeleteChain([]);
    state.delete.mockReturnValue(chain);

    await removeMember('group-1', 'user-1');

    expect(state.delete).toHaveBeenCalledWith(userGroupMembers);
    const query = compile(calls.where);
    expect(query.sql).toMatch(/group_id/);
    expect(query.sql).toMatch(/user_id/);
    expect(query.params).toEqual(['group-1', 'user-1']);
  });
});

describe('listMembers', () => {
  it('joins to users and returns decrypted phoneE164 alongside displayName/addedAt', async () => {
    const addedAt = new Date('2026-07-01T00:00:00Z');
    const rows = [
      { userId: 'user-1', displayName: 'Asha', phoneE164: 'cipher-abc', addedAt },
    ];
    const { chain, calls } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await listMembers('group-1');

    expect(calls.from).toBe(userGroupMembers);
    expect(calls.innerJoin).toBeDefined();
    expect(result).toEqual([
      { userId: 'user-1', displayName: 'Asha', phoneE164: 'decrypted:cipher-abc', addedAt },
    ]);
  });

  it('returns an empty array for a group with no members', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const result = await listMembers('group-empty');

    expect(result).toEqual([]);
  });
});

describe('listGroupIdsForUser', () => {
  it('returns the group ids the user belongs to, via the indexed user_id lookup', async () => {
    const { chain, calls } = makeSelectChain([{ groupId: 'g1' }, { groupId: 'g2' }]);
    state.select.mockReturnValue(chain);

    const result = await listGroupIdsForUser('user-1');

    expect(calls.from).toBe(userGroupMembers);
    const query = compile(calls.where);
    expect(query.sql).toMatch(/user_id/);
    expect(query.params).toEqual(['user-1']);
    expect(result).toEqual(['g1', 'g2']);
  });

  it('returns an empty array for a user in no groups', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const result = await listGroupIdsForUser('user-lonely');

    expect(result).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Group feature overrides                                                    */
/* -------------------------------------------------------------------------- */

describe('upsertGroupFeatureOverride', () => {
  it('inserts with ON CONFLICT(group_id, feature_key) DO UPDATE', async () => {
    const { chain, calls } = makeInsertChain([]);
    state.insert.mockReturnValue(chain);

    await upsertGroupFeatureOverride('group-1', 'paid.chat', false, '+919999111111');

    expect(state.insert).toHaveBeenCalledWith(featureFlagGroupOverrides);
    expect(calls.values).toMatchObject({
      groupId: 'group-1',
      featureKey: 'paid.chat',
      enabled: false,
      updatedBy: '+919999111111',
    });
    const target = (calls.onConflictDoUpdate as { target: unknown[] }).target;
    expect(target).toEqual([featureFlagGroupOverrides.groupId, featureFlagGroupOverrides.featureKey]);
  });
});

describe('deleteGroupFeatureOverride', () => {
  it('deletes the override row scoped to both group_id and feature_key (returns the key to "inherit")', async () => {
    const { chain, calls } = makeDeleteChain([]);
    state.delete.mockReturnValue(chain);

    await deleteGroupFeatureOverride('group-1', 'paid.chat');

    expect(state.delete).toHaveBeenCalledWith(featureFlagGroupOverrides);
    const query = compile(calls.where);
    expect(query.sql).toMatch(/group_id/);
    expect(query.sql).toMatch(/feature_key/);
    expect(query.params).toEqual(['group-1', 'paid.chat']);
  });
});

describe('listGroupFeatureOverrides', () => {
  it('returns featureKey/enabled pairs for one group', async () => {
    const { chain, calls } = makeSelectChain([
      { featureKey: 'paid.chat', enabled: false },
      { featureKey: 'paid.vastu', enabled: true },
    ]);
    state.select.mockReturnValue(chain);

    const result = await listGroupFeatureOverrides('group-1');

    expect(calls.from).toBe(featureFlagGroupOverrides);
    const query = compile(calls.where);
    expect(query.params).toEqual(['group-1']);
    expect(result).toEqual([
      { featureKey: 'paid.chat', enabled: false },
      { featureKey: 'paid.vastu', enabled: true },
    ]);
  });
});

describe('listAllGroupFeatureOverrides', () => {
  it('returns every override across every group in one query (no groupId filter)', async () => {
    const rows = [
      { groupId: 'g1', featureKey: 'paid.chat', enabled: false },
      { groupId: 'g2', featureKey: 'paid.chat', enabled: true },
    ];
    const { chain, calls } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await listAllGroupFeatureOverrides();

    expect(calls.from).toBe(featureFlagGroupOverrides);
    expect(calls.where).toBeUndefined();
    expect(result).toEqual(rows);
  });
});
