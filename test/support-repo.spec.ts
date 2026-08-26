import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Repo-layer coverage for support.repo.ts: encryption boundary (message/
// adminNote are encrypted on write, decrypted on read — same convention as
// chat-sessions.repo.ts/user-facts.repo.ts) plus the admin filter/pagination
// WHERE-clause shapes. Unlike chat-sessions-repo-profile.spec.ts/
// user-facts-repo-profile.spec.ts (which stub field-encryption.js as an
// identity pass-through), this file deliberately keeps the REAL
// encryptField/decryptField implementation and only mocks config/env.js to
// supply a valid test key — so the encryption round trip itself is exercised
// with real AES-256-GCM, not simulated.

const state = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  // Valid base64-encoded 32-byte key, generated the same way the real
  // ENCRYPTION_KEY is (`openssl rand -base64 32`) — declared inside
  // vi.hoisted so the vi.mock factory below (itself hoisted above regular
  // imports) can safely close over it.
  fakeEnv: {
    ENCRYPTION_KEY: Buffer.from('support-tickets-test-key-32-byte')
      .subarray(0, 32)
      .toString('base64'),
    ENCRYPTION_HASH_KEY: undefined as string | undefined,
  },
}));

vi.mock('../src/config/env.js', () => ({
  env: state.fakeEnv,
  isProduction: false,
  isTest: true,
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select, insert: state.insert, update: state.update }, sqlClient };
});

import { supportTickets } from '../src/db/schema.js';
import {
  createSupportTicket,
  listSupportTicketsByUser,
  listSupportTicketsForAdmin,
  countSupportTicketsForAdmin,
  getSupportTicketById,
  updateSupportTicket,
} from '../src/modules/support/support.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeLimitedChain {
  offset: (n: number) => Promise<unknown[]>;
  then: Promise<unknown[]>['then'];
}

interface FakeSelectChain {
  from: (t: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  orderBy: (ord: unknown) => FakeSelectChain;
  limit: (n: number) => FakeLimitedChain;
  then: Promise<unknown[]>['then'];
}

/**
 * One fake chain shape that covers every select() usage in support.repo.ts:
 * `.where().orderBy()` (listSupportTicketsByUser, awaited directly via
 * `then`), `.where().limit()` (getSupportTicketById), `.where().orderBy()
 * .limit().offset()` (listSupportTicketsForAdmin), and a bare `.where()`
 * (countSupportTicketsForAdmin's aggregate select).
 */
function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown; orderBy?: unknown; limit?: unknown; offset?: unknown } = {};
  const limitedChain: FakeLimitedChain = {
    offset: vi.fn((n: number) => {
      calls.offset = n;
      return Promise.resolve(result);
    }),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    orderBy: vi.fn((ord: unknown) => {
      calls.orderBy = ord;
      return chain;
    }),
    limit: vi.fn((n: number) => {
      calls.limit = n;
      return limitedChain;
    }),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return { chain, calls };
}

function makeInsertChain() {
  const calls: { values?: any } = {};
  const chain = {
    values: vi.fn((v: any) => {
      calls.values = v;
      return chain;
    }),
    returning: vi.fn(() =>
      Promise.resolve([
        {
          id: 'ticket-1',
          userId: calls.values.userId,
          category: calls.values.category,
          // Echo back exactly what was passed to .values() — this is what a
          // real Postgres RETURNING clause would hand back, i.e. the
          // ciphertext actually written to the column.
          message: calls.values.message,
          locale: calls.values.locale,
          appVersion: calls.values.appVersion,
          status: 'open',
          adminNote: null,
          createdAt: new Date('2026-07-25T00:00:00Z'),
          resolvedAt: null,
        },
      ]),
    ),
  };
  return { chain, calls };
}

function makeUpdateChain(existingRow: Record<string, unknown>) {
  const calls: { set?: any; where?: unknown } = {};
  const chain = {
    set: vi.fn((patch: any) => {
      calls.set = patch;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve([{ ...existingRow, ...calls.set }])),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
  state.update.mockReset();
});

describe('createSupportTicket — encryption round trip', () => {
  it('encrypts message before INSERT (ciphertext, not plaintext) and returns the original plaintext after decrypting the stored value', async () => {
    const { chain, calls } = makeInsertChain();
    state.insert.mockReturnValue(chain);

    const plaintext = 'My wallet top-up succeeded on Razorpay but the balance never updated.';
    const result = await createSupportTicket({
      userId: 'user-1',
      category: 'billing',
      message: plaintext,
    });

    expect(state.insert).toHaveBeenCalledWith(supportTickets);
    expect(calls.values.message).not.toBe(plaintext);
    expect(calls.values.message).toMatch(/^enc:v1:/);
    expect(result.message).toBe(plaintext);
    expect(result.userId).toBe('user-1');
    expect(result.category).toBe('billing');
  });

  it('defaults locale/appVersion to null when omitted', async () => {
    const { chain, calls } = makeInsertChain();
    state.insert.mockReturnValue(chain);

    await createSupportTicket({ userId: 'user-1', category: 'other', message: 'help' });

    expect(calls.values.locale).toBeNull();
    expect(calls.values.appVersion).toBeNull();
  });

  it('throws if the insert somehow returns no row', async () => {
    const chain = { values: vi.fn(() => chain), returning: vi.fn(() => Promise.resolve([])) };
    state.insert.mockReturnValue(chain);

    await expect(
      createSupportTicket({ userId: 'user-1', category: 'other', message: 'help' }),
    ).rejects.toThrow('createSupportTicket: insert returned no row');
  });

  it('creates an anonymous ticket (no userId) from contactName/contactEmail, encrypting both', async () => {
    const { chain, calls } = makeInsertChain();
    // makeInsertChain's fake row doesn't echo contactName/contactEmail —
    // extend it here so decryptRow has something to decrypt.
    chain.returning = vi.fn(() =>
      Promise.resolve([
        {
          id: 'ticket-1',
          userId: null,
          contactName: calls.values.contactName,
          contactEmail: calls.values.contactEmail,
          category: calls.values.category,
          message: calls.values.message,
          locale: null,
          appVersion: null,
          status: 'open',
          adminNote: null,
          createdAt: new Date('2026-08-26T00:00:00Z'),
          resolvedAt: null,
        },
      ]),
    );
    state.insert.mockReturnValue(chain);

    const result = await createSupportTicket({
      contactName: 'Priya Sharma',
      contactEmail: 'priya@example.com',
      category: 'billing',
      message: 'I was double-charged.',
    });

    expect(calls.values.userId).toBeNull();
    expect(calls.values.contactName).toMatch(/^enc:v1:/);
    expect(calls.values.contactEmail).toMatch(/^enc:v1:/);
    expect(result.userId).toBeNull();
    expect(result.contactName).toBe('Priya Sharma');
    expect(result.contactEmail).toBe('priya@example.com');
  });

  it('stores null contactName/contactEmail for an authenticated (in-app) ticket', async () => {
    const { chain, calls } = makeInsertChain();
    state.insert.mockReturnValue(chain);

    await createSupportTicket({ userId: 'user-1', category: 'billing', message: 'help' });

    expect(calls.values.contactName).toBeNull();
    expect(calls.values.contactEmail).toBeNull();
  });
});

describe('listSupportTicketsByUser', () => {
  it('filters on user_id and decrypts each row, newest first', async () => {
    const now = new Date('2026-07-25T00:00:00Z');
    const { chain, calls } = makeSelectChain([
      {
        id: 't1',
        userId: 'user-1',
        category: 'billing',
        // No 'enc:v1:' prefix — exercises decryptField's legacy-plaintext
        // short-circuit (a row written before encryption was enabled must
        // still read back correctly).
        message: 'a legacy unencrypted row',
        locale: null,
        appVersion: null,
        status: 'open',
        adminNote: null,
        createdAt: now,
        resolvedAt: null,
      },
    ]);
    state.select.mockReturnValue(chain);

    const tickets = await listSupportTicketsByUser('user-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"support_tickets"."user_id" = $1');
    expect(query.params).toEqual(['user-1']);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.message).toBe('a legacy unencrypted row');
  });
});

describe('getSupportTicketById', () => {
  it('returns undefined when no row matches', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const ticket = await getSupportTicketById('missing');

    expect(ticket).toBeUndefined();
  });
});

describe('listSupportTicketsForAdmin / countSupportTicketsForAdmin — filter shapes', () => {
  it('filters by userId only', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listSupportTicketsForAdmin({ userId: 'user-1' }, 20, 0);

    const query = compile(calls.where);
    expect(query.sql).toBe('"support_tickets"."user_id" = $1');
    expect(query.params).toEqual(['user-1']);
    expect(calls.limit).toBe(20);
    expect(calls.offset).toBe(0);
  });

  it('filters by status only', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listSupportTicketsForAdmin({ status: 'open' }, 20, 0);

    const query = compile(calls.where);
    expect(query.sql).toBe('"support_tickets"."status" = $1');
    expect(query.params).toEqual(['open']);
  });

  it('filters by userId AND status together', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listSupportTicketsForAdmin({ userId: 'user-1', status: 'resolved' }, 10, 5);

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("support_tickets"."user_id" = $1 and "support_tickets"."status" = $2)',
    );
    expect(query.params).toEqual(['user-1', 'resolved']);
    expect(calls.limit).toBe(10);
    expect(calls.offset).toBe(5);
  });

  it('countSupportTicketsForAdmin uses the identical filter shape as the list query', async () => {
    const { chain, calls } = makeSelectChain([{ count: 3 }]);
    state.select.mockReturnValue(chain);

    const total = await countSupportTicketsForAdmin({ userId: 'user-1', status: 'open' });

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("support_tickets"."user_id" = $1 and "support_tickets"."status" = $2)',
    );
    expect(total).toBe(3);
  });

  it('countSupportTicketsForAdmin returns 0 when the aggregate row is missing', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const total = await countSupportTicketsForAdmin({});

    expect(total).toBe(0);
  });
});

describe('updateSupportTicket — partial patch + adminNote encryption round trip', () => {
  it('only sets status when adminNote/resolvedAt are omitted', async () => {
    const { chain, calls } = makeUpdateChain({
      id: 't1',
      userId: 'user-1',
      category: 'billing',
      message: 'a previously stored message',
      locale: null,
      appVersion: null,
      status: 'open',
      adminNote: null,
      createdAt: new Date('2026-07-25T00:00:00Z'),
      resolvedAt: null,
    });
    state.update.mockReturnValue(chain);

    await updateSupportTicket('t1', { status: 'in_progress' });

    expect(calls.set).toEqual({ status: 'in_progress' });
  });

  it('encrypts adminNote on write and returns the decrypted original', async () => {
    const now = new Date('2026-07-25T00:00:00Z');
    const { chain, calls } = makeUpdateChain({
      id: 't1',
      userId: 'user-1',
      category: 'billing',
      message: 'a previously stored message',
      locale: null,
      appVersion: null,
      status: 'resolved',
      createdAt: now,
      resolvedAt: now,
    });
    state.update.mockReturnValue(chain);

    const note = 'Refunded via Razorpay dashboard.';
    const updated = await updateSupportTicket('t1', {
      status: 'resolved',
      adminNote: note,
      resolvedAt: now,
    });

    expect(calls.set.adminNote).not.toBe(note);
    expect(calls.set.adminNote).toMatch(/^enc:v1:/);
    expect(updated?.adminNote).toBe(note);
    expect(calls.set.resolvedAt).toBe(now);
  });

  it('explicitly clears resolvedAt (sets null) when told to, distinct from "leave as-is" (omitted)', async () => {
    const { chain, calls } = makeUpdateChain({
      id: 't1',
      userId: 'user-1',
      category: 'billing',
      message: 'a previously stored message',
      locale: null,
      appVersion: null,
      status: 'open',
      adminNote: null,
      createdAt: new Date('2026-07-25T00:00:00Z'),
      resolvedAt: null,
    });
    state.update.mockReturnValue(chain);

    await updateSupportTicket('t1', { status: 'open', resolvedAt: null });

    expect('resolvedAt' in calls.set).toBe(true);
    expect(calls.set.resolvedAt).toBeNull();
  });

  it('returns undefined when no row matches the id', async () => {
    const chain = {
      set: vi.fn(() => chain),
      where: vi.fn(() => chain),
      returning: vi.fn(() => Promise.resolve([])),
    };
    state.update.mockReturnValue(chain);

    const result = await updateSupportTicket('missing', { status: 'closed' });

    expect(result).toBeUndefined();
  });
});
