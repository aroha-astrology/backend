import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: { select: state.select, insert: state.insert, update: state.update },
    sqlClient,
  };
});

import {
  createMessage,
  listMessagesForBooking,
  markMessagesRead,
} from '../src/modules/messaging/messaging.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
  state.update.mockReset();
});

function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown } = {};
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    orderBy: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, calls };
}

function makeInsertChain(result: unknown[]) {
  const calls: { values?: unknown } = {};
  const chain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, calls };
}

function makeUpdateChain() {
  const calls: { set?: unknown; where?: unknown } = {};
  const chain = {
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

describe('createMessage', () => {
  it('inserts and returns the new row', async () => {
    const row = { id: 'msg-1', bookingType: 'astrologer', bookingId: 'booking-1', body: 'hi' };
    const { chain, calls } = makeInsertChain([row]);
    state.insert.mockReturnValue(chain);

    const result = await createMessage({
      bookingType: 'astrologer',
      bookingId: 'booking-1',
      senderRole: 'customer',
      senderUserId: 'user-1',
      senderProviderAccountId: null,
      body: 'hi',
    } as never);

    expect(calls.values).toMatchObject({ bookingId: 'booking-1', body: 'hi' });
    expect(result).toEqual(row);
  });
});

describe('listMessagesForBooking', () => {
  it('filters on (bookingType, bookingId), oldest first, with no after filter', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listMessagesForBooking('astrologer', 'booking-1');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("booking_messages"."booking_type" = $1 and "booking_messages"."booking_id" = $2)',
    );
    expect(query.params).toEqual(['astrologer', 'booking-1']);
  });

  it('adds a createdAt > after filter when options.after is given', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);
    const after = new Date('2026-01-01T00:00:00Z');

    await listMessagesForBooking('astrologer', 'booking-1', { after });

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("booking_messages"."booking_type" = $1 and "booking_messages"."booking_id" = $2 and "booking_messages"."created_at" > $3)',
    );
    // NOTE — deviation from the plan document: Drizzle's timestamp-column
    // driver-value mapper serializes a bound `Date` to its ISO string at
    // compile time (verified directly here), so the third bound param is a
    // string, not the raw `after` Date instance the plan's own test asserted.
    expect(query.params).toEqual(['astrologer', 'booking-1', after.toISOString()]);
  });
});

describe('markMessagesRead', () => {
  it("stamps readAt on the OTHER role's unread messages when the reader is the customer", async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    await markMessagesRead('astrologer', 'booking-1', 'customer');

    expect((calls.set as { readAt: Date }).readAt).toBeInstanceOf(Date);
    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("booking_messages"."booking_type" = $1 and "booking_messages"."booking_id" = $2 and "booking_messages"."sender_role" = $3 and "booking_messages"."read_at" is null)',
    );
    expect(query.params).toEqual(['astrologer', 'booking-1', 'provider']);
  });

  it("stamps readAt on the customer's messages when the reader is the provider", async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    await markMessagesRead('astrologer', 'booking-1', 'provider');

    const query = compile(calls.where);
    expect(query.params).toEqual(['astrologer', 'booking-1', 'customer']);
  });
});
