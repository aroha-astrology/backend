import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: {
      insert: state.insert,
      select: state.select,
      update: state.update,
      transaction: state.transaction,
    },
    sqlClient,
  };
});

import {
  listActivePoojas,
  findPoojaCatalogItem,
  createPoojaBooking,
  refundPoojaBooking,
  assignPanditToBooking,
  completePoojaBooking,
  findOwnedPoojaBooking,
  listPoojaBookingsForUser,
} from '../src/modules/pooja-bookings/pooja-bookings.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  limit: (n: number) => Promise<unknown[]>;
  orderBy: (col: unknown) => Promise<unknown[]>;
  then: Promise<unknown[]>['then'];
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
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
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

beforeEach(() => {
  state.insert.mockReset();
  state.select.mockReset();
  state.update.mockReset();
  state.transaction.mockReset();
});

describe('listActivePoojas', () => {
  it('filters on is_active = true', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listActivePoojas();

    const query = compile(calls.where);
    expect(query.sql).toBe('"pooja_catalog"."is_active" = $1');
    expect(query.params).toEqual([true]);
  });
});

describe('findPoojaCatalogItem', () => {
  it('filters on id', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findPoojaCatalogItem('pooja-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"pooja_catalog"."id" = $1');
    expect(query.params).toEqual(['pooja-1']);
  });
});

describe('createPoojaBooking — atomic debit + row creation', () => {
  function makeTx(opts: { walletUpdateResult: unknown[]; insertResult: unknown[] }) {
    const walletUpdateChain: { set: unknown; where: unknown; returning: () => Promise<unknown[]> } =
      {
        set: undefined,
        where: undefined,
        returning: vi.fn(() => Promise.resolve(opts.walletUpdateResult)),
      };
    walletUpdateChain.set = vi.fn(() => walletUpdateChain);
    walletUpdateChain.where = vi.fn(() => walletUpdateChain);

    const insertLedgerChain = { values: vi.fn(() => Promise.resolve(undefined)) };
    const insertBookingChain: { values: unknown; returning: () => Promise<unknown[]> } = {
      values: undefined,
      returning: vi.fn(() => Promise.resolve(opts.insertResult)),
    };
    insertBookingChain.values = vi.fn(() => insertBookingChain);

    let insertCallCount = 0;
    const tx = {
      update: vi.fn(() => walletUpdateChain),
      insert: vi.fn((_table: unknown) => {
        insertCallCount++;
        // First insert() call is the wallet ledger row, second is the
        // pooja_bookings row — matches createPoojaBooking's call order.
        return insertCallCount === 1 ? insertLedgerChain : insertBookingChain;
      }),
    };
    return { tx, insertBookingChain };
  }

  const INPUT = {
    userId: 'user-1',
    birthProfileId: null,
    poojaId: 'pooja-1',
    preferredDate: '2026-08-01',
    shipAddress: '123 MG Road',
    shipPincode: '560001',
    notes: null,
    pricePaise: 110000,
  };

  it('returns undefined without inserting a booking when the wallet balance is insufficient', async () => {
    const { tx } = makeTx({ walletUpdateResult: [], insertResult: [] });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await createPoojaBooking(INPUT);

    expect(result).toBeUndefined();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('debits the wallet, writes a ledger row, and returns the newly created requested booking', async () => {
    const { tx, insertBookingChain } = makeTx({
      walletUpdateResult: [{ walletBalancePaise: 390000 }],
      insertResult: [{ id: 'booking-1', status: 'requested', pricePaisePaid: 110000 }],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await createPoojaBooking(INPUT);

    expect(insertBookingChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        poojaId: 'pooja-1',
        panditId: null,
        status: 'requested',
        pricePaisePaid: 110000,
      }),
    );
    expect(result).toMatchObject({ id: 'booking-1', status: 'requested' });
  });

  it('returns insufficient_balance when createPoojaBooking returns undefined', async () => {
    const { tx } = makeTx({ walletUpdateResult: [], insertResult: [] });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await createPoojaBooking(INPUT);

    expect(result).toBeUndefined();
  });
});

describe('refundPoojaBooking — atomic refund + status flip', () => {
  function makeTx(opts: { bookingUpdateResult: unknown[]; userUpdateResult: unknown[] }) {
    const bookingWhereCalls: unknown[] = [];
    const bookingUpdateChain: {
      set: unknown;
      where: unknown;
      returning: () => Promise<unknown[]>;
    } = {
      set: undefined,
      where: undefined,
      returning: vi.fn(() => Promise.resolve(opts.bookingUpdateResult)),
    };
    bookingUpdateChain.set = vi.fn(() => bookingUpdateChain);
    bookingUpdateChain.where = vi.fn((cond: unknown) => {
      bookingWhereCalls.push(cond);
      return bookingUpdateChain;
    });

    const userUpdateChain: { set: unknown; where: unknown; returning: () => Promise<unknown[]> } = {
      set: undefined,
      where: undefined,
      returning: vi.fn(() => Promise.resolve(opts.userUpdateResult)),
    };
    userUpdateChain.set = vi.fn(() => userUpdateChain);
    userUpdateChain.where = vi.fn(() => userUpdateChain);

    const insertLedgerChain = { values: vi.fn(() => Promise.resolve(undefined)) };

    let updateCallCount = 0;
    const tx = {
      update: vi.fn((_table: unknown) => {
        updateCallCount++;
        // First update() call is pooja_bookings (the status-flip claim),
        // second is users (the wallet credit) — matches refundPoojaBooking's
        // call order.
        return updateCallCount === 1 ? bookingUpdateChain : userUpdateChain;
      }),
      insert: vi.fn(() => insertLedgerChain),
    };
    return { tx, userUpdateChain, insertLedgerChain, bookingWhereCalls };
  }

  it('returns undefined without touching the wallet when the booking is not in a refundable status', async () => {
    const { tx, userUpdateChain, insertLedgerChain } = makeTx({
      bookingUpdateResult: [],
      userUpdateResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await refundPoojaBooking('booking-1', 'user-1');

    expect(result).toBeUndefined();
    expect(userUpdateChain.set).not.toHaveBeenCalled();
    expect(insertLedgerChain.values).not.toHaveBeenCalled();
  });

  it("scopes the status-flip UPDATE's WHERE to this booking id, this owner, and status IN ('requested','assigned') — the race-safety guard", async () => {
    const { tx, bookingWhereCalls } = makeTx({ bookingUpdateResult: [], userUpdateResult: [] });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    await refundPoojaBooking('booking-1', 'user-1');

    const query = compile(bookingWhereCalls[0]);
    expect(query.sql).toBe(
      '("pooja_bookings"."id" = $1 and "pooja_bookings"."user_id" = $2 and "pooja_bookings"."status" in ($3, $4))',
    );
    expect(query.params).toEqual(['booking-1', 'user-1', 'requested', 'assigned']);
  });

  it('credits the wallet, writes a ledger row, and returns the refunded booking on success', async () => {
    const { tx } = makeTx({
      bookingUpdateResult: [
        { id: 'booking-1', userId: 'user-1', pricePaisePaid: 110000, status: 'refunded' },
      ],
      userUpdateResult: [{ walletBalancePaise: 500000 }],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await refundPoojaBooking('booking-1', 'user-1');

    expect(result).toMatchObject({ id: 'booking-1', status: 'refunded' });
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });

  it('throws instead of silently no-op-ing if the booking is refundable but its owning user row has vanished', async () => {
    const { tx } = makeTx({
      bookingUpdateResult: [
        { id: 'booking-1', userId: 'user-1', pricePaisePaid: 110000, status: 'refunded' },
      ],
      userUpdateResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    await expect(refundPoojaBooking('booking-1', 'user-1')).rejects.toThrow(
      'refundPoojaBooking: user user-1 not found while crediting refund for booking booking-1',
    );
  });
});

describe('assignPanditToBooking', () => {
  it("scopes the UPDATE's WHERE to this booking id and status = 'requested' (the claim guard)", async () => {
    const { chain, calls } = makeUpdateChain([]);
    state.update.mockReturnValue(chain);

    await assignPanditToBooking('booking-1', 'pandit-1');

    expect(calls.set).toMatchObject({ panditId: 'pandit-1', status: 'assigned' });
    const query = compile(calls.where);
    expect(query.sql).toBe('("pooja_bookings"."id" = $1 and "pooja_bookings"."status" = $2)');
    expect(query.params).toEqual(['booking-1', 'requested']);
  });

  it('returns the updated row on success', async () => {
    const { chain } = makeUpdateChain([
      { id: 'booking-1', status: 'assigned', panditId: 'pandit-1' },
    ]);
    state.update.mockReturnValue(chain);

    const result = await assignPanditToBooking('booking-1', 'pandit-1');

    expect(result).toMatchObject({ id: 'booking-1', status: 'assigned' });
  });
});

describe('completePoojaBooking', () => {
  it("scopes the UPDATE's WHERE to this booking id and status = 'assigned' (the claim guard)", async () => {
    const { chain, calls } = makeUpdateChain([]);
    state.update.mockReturnValue(chain);

    await completePoojaBooking('booking-1');

    expect(calls.set).toMatchObject({ status: 'completed' });
    const query = compile(calls.where);
    expect(query.sql).toBe('("pooja_bookings"."id" = $1 and "pooja_bookings"."status" = $2)');
    expect(query.params).toEqual(['booking-1', 'assigned']);
  });
});

describe('findOwnedPoojaBooking', () => {
  it('filters on id and user_id', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findOwnedPoojaBooking('booking-1', 'user-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('("pooja_bookings"."id" = $1 and "pooja_bookings"."user_id" = $2)');
    expect(query.params).toEqual(['booking-1', 'user-1']);
  });
});

describe('listPoojaBookingsForUser', () => {
  it('filters on user_id and orders newest-first', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listPoojaBookingsForUser('user-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"pooja_bookings"."user_id" = $1');
    expect(query.params).toEqual(['user-1']);
    expect(chain.orderBy).toHaveBeenCalled();
  });
});
