import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: {
      select: state.select,
      insert: state.insert,
      update: state.update,
      transaction: state.transaction,
    },
    sqlClient,
  };
});

import {
  completeBooking,
  confirmBooking,
  findAstrologerById,
  findBookingById,
  findOwnedBooking,
  insertAstrologer,
  listBookableAstrologers,
  listBookingsForAstrologer,
  listBookingsForUser,
  refundBooking,
  requestAstrologerBooking,
  updateAstrologer,
} from '../src/modules/astrologers/astrologers.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
  state.update.mockReset();
  state.transaction.mockReset();
});

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  limit: (n: number) => Promise<unknown[]>;
  orderBy: (col: unknown) => Promise<unknown[]>;
}

function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    limit: vi.fn(() => Promise.resolve(result)),
    orderBy: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, calls };
}

function makeUpdateChain(result: unknown[]) {
  const calls: { set?: unknown; where?: unknown } = {};
  const chain = {
    set: vi.fn((patch: unknown) => {
      calls.set = patch;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(result)),
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

describe('listBookableAstrologers', () => {
  it('filters on verified = true AND active = true', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listBookableAstrologers();

    const query = compile(calls.where);
    expect(query.sql).toBe('("astrologers"."verified" = $1 and "astrologers"."active" = $2)');
    expect(query.params).toEqual([true, true]);
  });
});

describe('findAstrologerById', () => {
  it('filters on id', async () => {
    const { chain, calls } = makeSelectChain([{ id: 'astro-1' }]);
    state.select.mockReturnValue(chain);

    const row = await findAstrologerById('astro-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"astrologers"."id" = $1');
    expect(query.params).toEqual(['astro-1']);
    expect(row).toEqual({ id: 'astro-1' });
  });
});

describe('insertAstrologer / updateAstrologer', () => {
  it('inserts and returns the new row', async () => {
    const { chain, calls } = makeInsertChain([{ id: 'astro-1', displayName: 'Guru Ji' }]);
    state.insert.mockReturnValue(chain);

    const row = await insertAstrologer({
      userId: null,
      displayName: 'Guru Ji',
      ratePaisePerSession: 50000,
    });

    expect(calls.values).toMatchObject({ displayName: 'Guru Ji' });
    expect(row).toEqual({ id: 'astro-1', displayName: 'Guru Ji' });
  });

  it('updates by id and stamps updatedAt', async () => {
    const { chain, calls } = makeUpdateChain([{ id: 'astro-1', verified: true }]);
    state.update.mockReturnValue(chain);

    const row = await updateAstrologer('astro-1', { verified: true });

    expect(calls.set).toMatchObject({ verified: true });
    expect((calls.set as { updatedAt: Date }).updatedAt).toBeInstanceOf(Date);
    const query = compile(calls.where);
    expect(query.sql).toBe('"astrologers"."id" = $1');
    expect(query.params).toEqual(['astro-1']);
    expect(row).toEqual({ id: 'astro-1', verified: true });
  });
});

describe('requestAstrologerBooking — atomic debit + booking creation', () => {
  function makeTx(opts: {
    astrologer: unknown[];
    walletUpdateResult: unknown[];
    bookingInsertResult: unknown[];
  }) {
    const astrologerSelect = makeSelectChain(opts.astrologer);
    const walletUpdate = makeUpdateChain(opts.walletUpdateResult);
    const ledgerInsert = { values: vi.fn(() => Promise.resolve(undefined)) };
    const bookingInsert = makeInsertChain(opts.bookingInsertResult);

    let insertCallCount = 0;
    const tx = {
      select: vi.fn(() => astrologerSelect.chain),
      update: vi.fn(() => walletUpdate.chain),
      insert: vi.fn(() => {
        insertCallCount++;
        return insertCallCount === 1 ? ledgerInsert : bookingInsert.chain;
      }),
    };
    return { tx, astrologerSelect, walletUpdate, ledgerInsert, bookingInsert };
  }

  it("returns 'not_bookable' without charging when the astrologer doesn't exist", async () => {
    const { tx } = makeTx({ astrologer: [], walletUpdateResult: [], bookingInsertResult: [] });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await requestAstrologerBooking('user-1', 'astro-1', null, 'evenings', null);

    expect(result).toBe('not_bookable');
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns 'not_bookable' without charging when the astrologer is not verified", async () => {
    const { tx } = makeTx({
      astrologer: [{ ratePaisePerSession: 50000, verified: false, active: true }],
      walletUpdateResult: [],
      bookingInsertResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await requestAstrologerBooking('user-1', 'astro-1', null, 'evenings', null);

    expect(result).toBe('not_bookable');
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns 'not_bookable' without charging when the astrologer is not active", async () => {
    const { tx } = makeTx({
      astrologer: [{ ratePaisePerSession: 50000, verified: true, active: false }],
      walletUpdateResult: [],
      bookingInsertResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await requestAstrologerBooking('user-1', 'astro-1', null, 'evenings', null);

    expect(result).toBe('not_bookable');
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns 'insufficient_balance' without inserting a booking when the wallet balance is too low", async () => {
    const { tx } = makeTx({
      astrologer: [{ ratePaisePerSession: 50000, verified: true, active: true }],
      walletUpdateResult: [],
      bookingInsertResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await requestAstrologerBooking('user-1', 'astro-1', null, 'evenings', null);

    expect(result).toBe('insufficient_balance');
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('debits the wallet at the astrologer CURRENT rate, writes a ledger row, and returns the new requested booking', async () => {
    const { tx, ledgerInsert, bookingInsert, walletUpdate } = makeTx({
      astrologer: [{ ratePaisePerSession: 75000, verified: true, active: true }],
      walletUpdateResult: [{ walletBalancePaise: 25000 }],
      bookingInsertResult: [{ id: 'booking-1', status: 'requested', pricePaisePaid: 75000 }],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await requestAstrologerBooking(
      'user-1',
      'astro-1',
      'profile-a',
      'weekday evenings IST',
      'Please focus on career',
    );

    expect(result).toMatchObject({ id: 'booking-1', status: 'requested', pricePaisePaid: 75000 });
    expect(ledgerInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', delta: -75000, balanceAfter: 25000 }),
    );
    expect(bookingInsert.calls.values).toMatchObject({
      userId: 'user-1',
      astrologerId: 'astro-1',
      birthProfileId: 'profile-a',
      preferredTimeWindow: 'weekday evenings IST',
      status: 'requested',
      pricePaisePaid: 75000,
      notes: 'Please focus on career',
    });

    const walletQuery = compile(walletUpdate.calls.where);
    expect(walletQuery.sql).toBe('("users"."id" = $1 and "users"."wallet_balance_paise" >= $2)');
    expect(walletQuery.params).toEqual(['user-1', 75000]);
  });
});

describe('refundBooking — atomic CAS + wallet credit (a genuinely new primitive)', () => {
  function makeTx(opts: { bookingCasResult: unknown[]; walletCreditResult: unknown[] }) {
    const bookingUpdate = makeUpdateChain(opts.bookingCasResult);
    const walletUpdate = makeUpdateChain(opts.walletCreditResult);
    const ledgerInsert = { values: vi.fn(() => Promise.resolve(undefined)) };

    let updateCallCount = 0;
    const tx = {
      update: vi.fn(() => {
        updateCallCount++;
        return updateCallCount === 1 ? bookingUpdate.chain : walletUpdate.chain;
      }),
      insert: vi.fn(() => ledgerInsert),
    };
    return { tx, bookingUpdate, walletUpdate, ledgerInsert };
  }

  it('returns undefined without touching the wallet when the booking is not "requested" (CAS miss)', async () => {
    const { tx, walletUpdate, ledgerInsert } = makeTx({
      bookingCasResult: [],
      walletCreditResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await refundBooking('booking-1', 'user-1');

    expect(result).toBeUndefined();
    expect(walletUpdate.chain.set).not.toHaveBeenCalled();
    expect(ledgerInsert.values).not.toHaveBeenCalled();
  });

  it('scopes the CAS to (id, userId, status=requested) — ownership + state fence in one WHERE', async () => {
    const { tx, bookingUpdate } = makeTx({ bookingCasResult: [], walletCreditResult: [] });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    await refundBooking('booking-1', 'user-1');

    const query = compile(bookingUpdate.calls.where);
    expect(query.sql).toBe(
      '("astrologer_bookings"."id" = $1 and "astrologer_bookings"."user_id" = $2 and "astrologer_bookings"."status" = $3)',
    );
    expect(query.params).toEqual(['booking-1', 'user-1', 'requested']);
    expect(bookingUpdate.calls.set).toMatchObject({ status: 'refunded' });
  });

  it('credits the wallet the EXACT original price and writes a ledger row with the negated delta, on a CAS hit', async () => {
    const { tx, walletUpdate, ledgerInsert } = makeTx({
      bookingCasResult: [
        { id: 'booking-1', userId: 'user-1', status: 'refunded', pricePaisePaid: 75000 },
      ],
      walletCreditResult: [{ walletBalancePaise: 175000 }],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await refundBooking('booking-1', 'user-1');

    expect(result).toMatchObject({ id: 'booking-1', status: 'refunded', pricePaisePaid: 75000 });
    const walletQuery = compile(walletUpdate.calls.where);
    expect(walletQuery.sql).toBe('"users"."id" = $1');
    expect(walletQuery.params).toEqual(['user-1']);
    expect(ledgerInsert.values).toHaveBeenCalledWith({
      userId: 'user-1',
      delta: 75000,
      reason: 'astrologer_booking_refund:booking-1',
      balanceAfter: 175000,
    });
  });

  it('throws (never silently swallows) if the wallet credit UPDATE somehow matches no user row after a CAS hit', async () => {
    const { tx } = makeTx({
      bookingCasResult: [{ id: 'booking-1', userId: 'user-1', pricePaisePaid: 75000 }],
      walletCreditResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    await expect(refundBooking('booking-1', 'user-1')).rejects.toThrow(
      'refundBooking: user user-1 not found mid-transaction',
    );
  });
});

describe('confirmBooking / completeBooking', () => {
  it('confirmBooking scopes to status=requested and sets confirmedAt', async () => {
    const { chain, calls } = makeUpdateChain([{ id: 'booking-1', status: 'confirmed' }]);
    state.update.mockReturnValue(chain);

    const row = await confirmBooking('booking-1');

    expect((calls.set as { confirmedAt: Date }).confirmedAt).toBeInstanceOf(Date);
    expect(calls.set).toMatchObject({ status: 'confirmed' });
    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("astrologer_bookings"."id" = $1 and "astrologer_bookings"."status" = $2)',
    );
    expect(query.params).toEqual(['booking-1', 'requested']);
    expect(row).toEqual({ id: 'booking-1', status: 'confirmed' });
  });

  it('confirmBooking returns undefined when the booking is not currently requested', async () => {
    const { chain } = makeUpdateChain([]);
    state.update.mockReturnValue(chain);

    const row = await confirmBooking('booking-1');

    expect(row).toBeUndefined();
  });

  it('completeBooking scopes to status=confirmed and sets completedAt', async () => {
    const { chain, calls } = makeUpdateChain([{ id: 'booking-1', status: 'completed' }]);
    state.update.mockReturnValue(chain);

    const row = await completeBooking('booking-1');

    expect((calls.set as { completedAt: Date }).completedAt).toBeInstanceOf(Date);
    const query = compile(calls.where);
    expect(query.params).toEqual(['booking-1', 'confirmed']);
    expect(row).toEqual({ id: 'booking-1', status: 'completed' });
  });
});

describe('listBookingsForUser / findOwnedBooking', () => {
  it('listBookingsForUser filters on userId', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listBookingsForUser('user-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"astrologer_bookings"."user_id" = $1');
    expect(query.params).toEqual(['user-1']);
  });

  it('findOwnedBooking filters on (id, userId)', async () => {
    const { chain, calls } = makeSelectChain([{ id: 'booking-1', userId: 'user-1' }]);
    state.select.mockReturnValue(chain);

    const row = await findOwnedBooking('booking-1', 'user-1');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("astrologer_bookings"."id" = $1 and "astrologer_bookings"."user_id" = $2)',
    );
    expect(query.params).toEqual(['booking-1', 'user-1']);
    expect(row).toEqual({ id: 'booking-1', userId: 'user-1' });
  });
});

describe('listBookingsForAstrologer', () => {
  it('filters on astrologerId, newest first', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listBookingsForAstrologer('astro-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"astrologer_bookings"."astrologer_id" = $1');
    expect(query.params).toEqual(['astro-1']);
  });
});

describe('findBookingById', () => {
  it('filters on id only (unscoped by userId — used by messaging authorization, which must load a booking on behalf of either party)', async () => {
    const { chain, calls } = makeSelectChain([{ id: 'booking-1', astrologerId: 'astro-1' }]);
    state.select.mockReturnValue(chain);

    const row = await findBookingById('booking-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"astrologer_bookings"."id" = $1');
    expect(query.params).toEqual(['booking-1']);
    expect(row).toEqual({ id: 'booking-1', astrologerId: 'astro-1' });
  });
});
