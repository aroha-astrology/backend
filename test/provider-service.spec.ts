import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AstrologerBookingRow, AstrologerRow } from '../src/db/schema.js';

const state = vi.hoisted(() => ({
  findAstrologerById: vi.fn(),
  listBookingsForAstrologer: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('../src/modules/astrologers/astrologers.repo.js', () => ({
  findAstrologerById: state.findAstrologerById,
  listBookingsForAstrologer: state.listBookingsForAstrologer,
}));

const { getProviderMe, listProviderBookings } =
  await import('../src/modules/providers/provider.service.js');

function makeAstrologerRow(overrides: Partial<AstrologerRow> = {}): AstrologerRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'astro-1',
    userId: null,
    displayName: 'Guru Ji',
    bio: null,
    specialties: ['career'],
    languages: ['en'],
    photoUrl: null,
    ratePaisePerSession: 50000,
    verified: true,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeBookingRow(overrides: Partial<AstrologerBookingRow> = {}): AstrologerBookingRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'booking-1',
    userId: 'user-1',
    astrologerId: 'astro-1',
    birthProfileId: null,
    preferredTimeWindow: 'weekday evenings IST',
    status: 'requested',
    pricePaisePaid: 50000,
    requestedAt: now,
    confirmedAt: null,
    completedAt: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  state.findAstrologerById.mockReset();
  state.listBookingsForAstrologer.mockReset();
});

describe('getProviderMe', () => {
  it('inlines the full astrologer profile when kind is astrologer', async () => {
    state.findAstrologerById.mockResolvedValueOnce(makeAstrologerRow());

    const result = await getProviderMe({
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
    });

    expect(state.findAstrologerById).toHaveBeenCalledWith('astro-1');
    expect(result).toMatchObject({
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
      astrologer: expect.objectContaining({ id: 'astro-1', displayName: 'Guru Ji' }),
    });
  });

  it('returns astrologer: null when the astrologer row is somehow missing', async () => {
    state.findAstrologerById.mockResolvedValueOnce(undefined);

    const result = await getProviderMe({
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
    });

    expect(result.astrologer).toBeNull();
  });
});

describe('listProviderBookings', () => {
  it("lists the astrologer's own bookings when kind is astrologer", async () => {
    const booking = makeBookingRow();
    state.listBookingsForAstrologer.mockResolvedValueOnce([booking]);

    const result = await listProviderBookings({ kind: 'astrologer', refId: 'astro-1' });

    expect(state.listBookingsForAstrologer).toHaveBeenCalledWith('astro-1');
    expect(result).toEqual([expect.objectContaining({ id: 'booking-1', astrologerId: 'astro-1' })]);
  });

  it("returns an empty list for kind 'pandit' (no pooja_bookings repo query exists yet)", async () => {
    const result = await listProviderBookings({ kind: 'pandit', refId: 'pandit-1' });

    expect(result).toEqual([]);
    expect(state.listBookingsForAstrologer).not.toHaveBeenCalled();
  });
});
