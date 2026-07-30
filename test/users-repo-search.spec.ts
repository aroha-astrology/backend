import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// listUsersPage gains an optional `q` search param for the admin dashboard's
// GET /v1/admin/users?q= — phoneE164 is encrypted at rest (non-deterministic
// ciphertext), so a partial ILIKE search can't work on it; the search
// instead ILIKEs the plaintext displayName/email columns and does an EXACT
// hash-equality match for phone (same lookup primitive findUserByPhoneE164
// already uses). countUsersMatching shares the same where-clause so the
// admin pagination total matches what listUsersPage actually returned.
const state = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select }, sqlClient };
});

vi.mock('../src/lib/crypto/field-encryption.js', () => ({
  encryptField: (v: string | null) => (v ? `enc(${v})` : null),
  decryptField: (v: string | null) => (v ? v.replace(/^enc\(/, '').replace(/\)$/, '') : v),
  encryptJson: (v: unknown) => v,
  decryptJson: (v: unknown) => v,
  hashForLookup: (v: string) => `hash(${v})`,
}));

import { listUsersPage, countUsersMatching } from '../src/modules/users/users.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  orderBy: (...cols: unknown[]) => FakeSelectChain;
  limit: (n: number) => FakeSelectChain;
  offset: (n: number) => FakeSelectChain;
  then: (resolve: (value: unknown) => void) => void;
}

/** Awaitable at every step (like the real drizzle builder) — countUsersMatching awaits right after `.where()`, listUsersPage keeps chaining through `.orderBy().limit().offset()`. */
function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.select.mockReset();
});

describe('listUsersPage with a search term', () => {
  it('ILIKEs displayName/email and exact-matches the phone hash when q is given', async () => {
    const rows = [
      {
        id: 'u1',
        displayName: 'Asha',
        phoneE164: 'enc(+919999999999)',
        email: 'asha@test.com',
        walletBalancePaise: 1000,
        createdAt: new Date(),
        lastActiveAt: null,
      },
    ];
    const { chain, calls } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await listUsersPage(20, 0, 'asha');

    const compiled = compile(calls.where);
    expect(compiled.sql).toMatch(/ilike/i);
    expect(compiled.sql).toMatch(/display_name/);
    expect(compiled.sql).toMatch(/email/);
    expect(compiled.sql).toMatch(/phone_e164_hash/);
    expect(compiled.params).toContain('hash(asha)');
    expect(result[0]!.phoneE164).toBe('+919999999999');
  });

  it('falls back to plain (non-deleted) pagination when q is omitted', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listUsersPage(20, 0);

    const compiled = compile(calls.where);
    expect(compiled.sql).not.toMatch(/ilike/i);
    expect(compiled.sql).toMatch(/deleted_at/);
  });
});

describe('countUsersMatching', () => {
  it('counts using the same search predicate as listUsersPage', async () => {
    const { chain, calls } = makeSelectChain([{ count: 4 }]);
    state.select.mockReturnValue(chain);

    const result = await countUsersMatching('asha');

    const compiled = compile(calls.where);
    expect(compiled.sql).toMatch(/ilike/i);
    expect(result).toBe(4);
  });

  it('counts every non-deleted user when q is omitted', async () => {
    const { chain, calls } = makeSelectChain([{ count: 100 }]);
    state.select.mockReturnValue(chain);

    const result = await countUsersMatching();

    const compiled = compile(calls.where);
    expect(compiled.sql).not.toMatch(/ilike/i);
    expect(result).toBe(100);
  });
});
