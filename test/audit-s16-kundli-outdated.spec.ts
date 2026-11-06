import { beforeEach, describe, expect, it, vi } from 'vitest';

// Audit Sprint 16: GET /me tells the app whether the active profile's saved Kundli was built by an
// older calculation. `kundliOutdated` = a ready chart whose saved calculation_version is not the
// current one. `kundliUpdating` = that same old chart is being rebuilt right now.

const state = vi.hoisted(() => ({ findKundliByUserId: vi.fn() }));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});
vi.mock('../src/modules/kundli/kundli.repo.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  findKundliByUserId: state.findKundliByUserId,
}));

const { kundliUpdateState, resolveKundliUpdate } =
  await import('../src/modules/kundli/kundli.service.js');
const { CALCULATION_VERSION } = await import('../src/lib/astro-engine/version.js');

type Row = NonNullable<Parameters<typeof kundliUpdateState>[0]>;
const row = (over: Partial<Row>): Row => ({
  status: 'ready',
  calculationVersion: CALCULATION_VERSION,
  startedAt: new Date(),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('kundliUpdateState', () => {
  it('current chart: nothing to update', () => {
    expect(kundliUpdateState(row({}))).toEqual({ kundliOutdated: false, kundliUpdating: false });
  });

  it('ready chart built by an older version: outdated', () => {
    expect(kundliUpdateState(row({ calculationVersion: '2026.08.1' }))).toEqual({
      kundliOutdated: true,
      kundliUpdating: false,
    });
  });

  it('ready chart saved before versions were recorded (null): outdated', () => {
    expect(kundliUpdateState(row({ calculationVersion: null })).kundliOutdated).toBe(true);
  });

  it('old chart being rebuilt: updating, no longer outdated', () => {
    expect(
      kundliUpdateState(row({ status: 'generating', calculationVersion: '2026.08.1' })),
    ).toEqual({ kundliOutdated: false, kundliUpdating: true });
  });

  it('first chart still generating (no version yet): neither', () => {
    expect(kundliUpdateState(row({ status: 'generating', calculationVersion: null }))).toEqual({
      kundliOutdated: false,
      kundliUpdating: false,
    });
  });

  it('generating run that crashed long ago is not shown as updating', () => {
    const old = new Date(Date.now() - 24 * 3600 * 1000);
    expect(
      kundliUpdateState(
        row({ status: 'generating', calculationVersion: '2026.08.1', startedAt: old }),
      ).kundliUpdating,
    ).toBe(false);
  });

  it('failed or pending chart: neither', () => {
    expect(kundliUpdateState(row({ status: 'failed', calculationVersion: '2026.08.1' }))).toEqual({
      kundliOutdated: false,
      kundliUpdating: false,
    });
  });

  it('no chart at all: neither', () => {
    expect(kundliUpdateState(undefined)).toEqual({ kundliOutdated: false, kundliUpdating: false });
  });
});

describe('resolveKundliUpdate', () => {
  it('reads the chart of the active profile (family profile id passed through)', async () => {
    state.findKundliByUserId.mockResolvedValue(row({ calculationVersion: '2026.08.1' }));
    const out = await resolveKundliUpdate('u1', 'profile-7');
    expect(state.findKundliByUserId).toHaveBeenCalledWith('u1', 'profile-7');
    expect(out.kundliOutdated).toBe(true);
  });

  it('a lookup failure never breaks /me: reports neither', async () => {
    state.findKundliByUserId.mockRejectedValue(new Error('db down'));
    expect(await resolveKundliUpdate('u1', null)).toEqual({
      kundliOutdated: false,
      kundliUpdating: false,
    });
  });
});

describe('toUserDto', () => {
  it('carries the two flags, false when no state is passed', async () => {
    const { toUserDto } = await import('../src/modules/users/users.service.js');
    const { makeUserRow, makeProfileContext } = await import('./helpers/mocks.js');
    const base = toUserDto(makeUserRow({}), makeProfileContext(), {}, false, [], null);
    expect(base.kundliOutdated).toBe(false);
    expect(base.kundliUpdating).toBe(false);
    const flagged = toUserDto(makeUserRow({}), makeProfileContext(), {}, false, [], null, null, {
      kundliOutdated: true,
      kundliUpdating: false,
    });
    expect(flagged.kundliOutdated).toBe(true);
  });
});
