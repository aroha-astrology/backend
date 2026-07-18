import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BirthProfileRow } from '../src/db/schema.js';
import { makeUserRow } from './helpers/mocks.js';

vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  findOwnedBirthProfile: vi.fn(),
}));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { findOwnedBirthProfile } from '../src/modules/birth-profiles/birth-profiles.repo.js';
import { logger } from '../src/lib/logger.js';
import {
  resolveActiveProfileContext,
  resolveProfileContext,
} from '../src/modules/birth-profiles/profile-context.js';

function makeBirthProfileRow(overrides: Partial<BirthProfileRow> = {}): BirthProfileRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'profile-1',
    ownerUserId: 'user-1',
    relationship: 'partner',
    displayName: 'Bob',
    gender: 'male',
    dateOfBirth: '1990-05-10',
    timeOfBirth: '08:15:00',
    placeOfBirth: { name: 'Delhi', lat: 28.6, lon: 77.2, tz: 'Asia/Kolkata' },
    birthTimeAccuracy: 'exact',
    birthTimeSource: 'birth_certificate',
    birthLocationAccuracy: 'exact',
    gotra: null,
    addedWithConsent: true,
    notes: null,
    unlockedHouses: [2, 5],
    gemstoneUnlockedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(findOwnedBirthProfile).mockReset();
  vi.mocked(logger.warn).mockReset();
});

describe('resolveProfileContext', () => {
  it('returns the primary profile built from the user row, without a DB call, when activeProfileId is null', async () => {
    const user = makeUserRow({
      id: 'user-1',
      displayName: 'Alice',
      gender: 'female',
      dateOfBirth: '1995-04-12',
      timeOfBirth: '06:30:00',
      placeOfBirth: { name: 'Mumbai', lat: 19, lon: 72, tz: 'Asia/Kolkata' },
      birthTimeAccuracy: 'exact',
      birthTimeSource: 'hospital_record',
      birthLocationAccuracy: 'exact',
      unlockedHouses: [1, 3],
      gemstoneUnlockedAt: null,
      activeProfileId: null,
    });

    const ctx = await resolveProfileContext(user, null);

    expect(ctx).toEqual({
      birthProfileId: null,
      displayName: 'Alice',
      gender: 'female',
      dateOfBirth: '1995-04-12',
      timeOfBirth: '06:30:00',
      placeOfBirth: { name: 'Mumbai', lat: 19, lon: 72, tz: 'Asia/Kolkata' },
      birthTimeAccuracy: 'exact',
      birthTimeSource: 'hospital_record',
      birthLocationAccuracy: 'exact',
      unlockedHouses: [1, 3],
      gemstoneUnlockedAt: null,
    });
    expect(findOwnedBirthProfile).not.toHaveBeenCalled();
  });

  it('returns a birth_profiles-derived context for a valid additional profile', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: 'profile-1' });
    vi.mocked(findOwnedBirthProfile).mockResolvedValueOnce(makeBirthProfileRow());

    const ctx = await resolveProfileContext(user, 'profile-1');

    expect(findOwnedBirthProfile).toHaveBeenCalledWith('profile-1', 'user-1');
    expect(ctx).toEqual({
      birthProfileId: 'profile-1',
      displayName: 'Bob',
      gender: 'male',
      dateOfBirth: '1990-05-10',
      timeOfBirth: '08:15:00',
      placeOfBirth: { name: 'Delhi', lat: 28.6, lon: 77.2, tz: 'Asia/Kolkata' },
      birthTimeAccuracy: 'exact',
      birthTimeSource: 'birth_certificate',
      birthLocationAccuracy: 'exact',
      unlockedHouses: [2, 5],
      gemstoneUnlockedAt: null,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('falls back to the primary profile and logs a warning when the profile is not found (deleted/not owned)', async () => {
    const user = makeUserRow({
      id: 'user-1',
      displayName: 'Alice',
      activeProfileId: 'stale-profile',
      unlockedHouses: [7],
    });
    vi.mocked(findOwnedBirthProfile).mockResolvedValueOnce(undefined);

    const ctx = await resolveProfileContext(user, 'stale-profile');

    expect(findOwnedBirthProfile).toHaveBeenCalledWith('stale-profile', 'user-1');
    expect(ctx.birthProfileId).toBeNull();
    expect(ctx.displayName).toBe('Alice');
    expect(ctx.unlockedHouses).toEqual([7]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [meta] = vi.mocked(logger.warn).mock.calls[0] as [Record<string, unknown>, string];
    expect(meta).toMatchObject({ userId: 'user-1', activeProfileId: 'stale-profile' });
  });

  it('normalizes a null unlockedHouses on the primary profile (users row) to []', async () => {
    const user = makeUserRow({
      id: 'user-1',
      activeProfileId: null,
      unlockedHouses: null as never,
    });

    const ctx = await resolveProfileContext(user, null);

    expect(ctx.unlockedHouses).toEqual([]);
  });

  it('normalizes a null unlockedHouses on an additional profile to []', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: 'profile-1' });
    vi.mocked(findOwnedBirthProfile).mockResolvedValueOnce(
      makeBirthProfileRow({ unlockedHouses: null }),
    );

    const ctx = await resolveProfileContext(user, 'profile-1');

    expect(ctx.unlockedHouses).toEqual([]);
  });

  it('normalizes an undefined unlockedHouses on the primary profile to []', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: null });
    // Simulate a row where the field is entirely absent (not just null).
    delete (user as { unlockedHouses?: unknown }).unlockedHouses;

    const ctx = await resolveProfileContext(user, null);

    expect(ctx.unlockedHouses).toEqual([]);
  });
});

describe('resolveActiveProfileContext', () => {
  it('resolves using user.activeProfileId (primary)', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: null, displayName: 'Alice' });

    const ctx = await resolveActiveProfileContext(user);

    expect(ctx.birthProfileId).toBeNull();
    expect(ctx.displayName).toBe('Alice');
    expect(findOwnedBirthProfile).not.toHaveBeenCalled();
  });

  it('resolves using user.activeProfileId (additional profile)', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: 'profile-1' });
    vi.mocked(findOwnedBirthProfile).mockResolvedValueOnce(makeBirthProfileRow());

    const ctx = await resolveActiveProfileContext(user);

    expect(findOwnedBirthProfile).toHaveBeenCalledWith('profile-1', 'user-1');
    expect(ctx.birthProfileId).toBe('profile-1');
  });
});
