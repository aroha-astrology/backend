import type { BirthProfileRow, UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { addCredits, deductCredits, updateUserById } from '../users/users.repo.js';
import { requestKundliGeneration } from '../kundli/kundli.service.js';
import { createBirthProfile } from './birth-profiles.service.js';
import {
  findOwnedBirthProfile,
  hardDeleteOwnedBirthProfile,
  listBirthProfilesByOwner,
} from './birth-profiles.repo.js';
import type { CreateBirthProfileBody } from './birth-profiles.schemas.js';
import type { ProfileDto } from './profiles.schemas.js';

/** Credits charged to create an additional (non-primary) profile. */
export const PROFILE_CREATION_COST = 20;

function primaryProfileDto(user: UserRow): ProfileDto {
  return {
    id: 'primary',
    isPrimary: true,
    isActive: user.activeProfileId === null,
    relationship: null,
    displayName: user.displayName,
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    timeOfBirth: user.timeOfBirth,
    placeOfBirth: user.placeOfBirth,
    createdAt: user.createdAt.toISOString(),
  };
}

function additionalProfileDto(row: BirthProfileRow, isActive: boolean): ProfileDto {
  return {
    id: row.id,
    isPrimary: false,
    isActive,
    relationship: row.relationship,
    displayName: row.displayName,
    gender: row.gender,
    dateOfBirth: row.dateOfBirth,
    timeOfBirth: row.timeOfBirth,
    placeOfBirth: row.placeOfBirth,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The primary/self profile (synthesized from `user`'s own columns) prepended
 * to the user's owned additional `birth_profiles` rows.
 */
export async function listProfiles(user: UserRow): Promise<ProfileDto[]> {
  const rows = await listBirthProfilesByOwner(user.id);
  return [
    primaryProfileDto(user),
    ...rows.map((row) => additionalProfileDto(row, row.id === user.activeProfileId)),
  ];
}

/**
 * Creates a new additional profile, charging `PROFILE_CREATION_COST` credits
 * up front. If profile creation itself fails, the charge is refunded and the
 * error rethrown — never leaves the user charged without a profile to show
 * for it. Once the profile row exists, it's made the active profile and
 * kundli generation is kicked off fire-and-forget (the frontend already
 * polls `GET /v1/kundli` for `generating` status).
 */
export async function createProfile(
  user: UserRow,
  body: CreateBirthProfileBody,
): Promise<ProfileDto> {
  const charged = await deductCredits(user.id, PROFILE_CREATION_COST);
  if (!charged) throw Errors.conflict('INSUFFICIENT_CREDITS');

  let created: BirthProfileRow;
  try {
    created = await createBirthProfile(user.id, body);
  } catch (err) {
    await addCredits(user.id, PROFILE_CREATION_COST).catch(() => {});
    throw err;
  }

  await updateUserById(user.id, { activeProfileId: created.id });

  void requestKundliGeneration(user.id, created.id).catch((err: unknown) => {
    logger.error(
      { err, userId: user.id, birthProfileId: created.id },
      'profile-create: kundli background generation errored',
    );
  });

  return additionalProfileDto(created, true);
}

/**
 * Switches the user's active profile. `id === 'primary'` clears
 * `activeProfileId` back to the primary/self profile; any other `id` must be
 * an owned, non-deleted `birth_profiles` row — 404s otherwise.
 */
export async function activateProfile(user: UserRow, id: string): Promise<ProfileDto> {
  if (id === 'primary') {
    await updateUserById(user.id, { activeProfileId: null });
    return primaryProfileDto({ ...user, activeProfileId: null });
  }

  const profile = await findOwnedBirthProfile(id, user.id);
  if (!profile) throw Errors.notFound('Profile not found');

  await updateUserById(user.id, { activeProfileId: profile.id });
  return additionalProfileDto(profile, true);
}

/**
 * Permanently deletes an owned additional profile (real row delete, not the
 * soft delete `/v1/birth-profiles` uses) so its kundli/horoscope/
 * house-insight/gemstone/chat data is actually freed via the `ON DELETE
 * CASCADE` FKs, and `users.activeProfileId` self-heals via `ON DELETE SET
 * NULL` if this was the active profile.
 */
export async function deleteProfile(user: UserRow, id: string): Promise<void> {
  const row = await hardDeleteOwnedBirthProfile(id, user.id);
  if (!row) throw Errors.notFound('Profile not found');
}
