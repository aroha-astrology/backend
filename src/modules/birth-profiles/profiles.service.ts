import type { BirthProfileRow, UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { addWalletBalance, deductWalletBalance, updateUserById } from '../users/users.repo.js';
import { requestKundliGeneration } from '../kundli/kundli.service.js';
import { createBirthProfile } from './birth-profiles.service.js';
import {
  findOwnedBirthProfile,
  hardDeleteOwnedBirthProfile,
  listBirthProfilesByOwner,
} from './birth-profiles.repo.js';
import type { CreateBirthProfileBody } from './birth-profiles.schemas.js';
import type { ProfileDto } from './profiles.schemas.js';

/**
 * Switchable-account-profile business logic for `/v1/profiles`. Deliberately
 * has no get-one/update-one operations: editing an existing additional
 * profile's birth details still goes through `/v1/birth-profiles/{id}`
 * (`birth-profiles.service.js`) — this module only owns creation (with the
 * credit charge + auto-activate), listing, activation, and hard deletion.
 */

/** Cost in paise to create an additional (non-primary) profile (Rs 200 = 20 credits at the old rate). */
export const PROFILE_CREATION_COST_PAISE = 20000;

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
 * Creates a new additional profile, charging `PROFILE_CREATION_COST_PAISE`
 * up front. If profile creation itself fails, the charge is refunded and the
 * error rethrown — never leaves the user charged without a profile to show
 * for it.
 *
 * Once the profile row exists, the charge is considered spent regardless of
 * what happens next — the row is real. Making it the active profile is a
 * separate call to a separate table with no shared transaction (deliberately;
 * a full cross-module transaction here would be disproportionate), so its
 * failure is handled locally rather than surfaced as a request-level error:
 * on failure we log and return 201 with `isActive: false` instead of
 * rethrowing into a bare 500 that would hide a real, paid-for profile from
 * the client. `GET /v1/profiles` / `POST /v1/profiles/{id}/activate` remain
 * available afterwards to retry activation.
 *
 * Kundli generation is kicked off fire-and-forget either way (the frontend
 * already polls `GET /v1/kundli` for `generating` status). Unlike
 * `vastu.service.ts`'s `requestVastuAnalysis` — which refunds if the AI
 * generation it charged for fails, because the generated report *is* the
 * paid-for product — the charge here is for the profile row itself, which
 * already exists by this point; a failed/slow kundli generation is retried
 * transparently by `GET /v1/kundli`'s self-heal, so it doesn't warrant a
 * refund.
 */
export async function createProfile(
  user: UserRow,
  body: CreateBirthProfileBody,
): Promise<ProfileDto> {
  const charged = await deductWalletBalance(
    user.id,
    PROFILE_CREATION_COST_PAISE,
    'profile_creation',
  );
  if (!charged) throw Errors.conflict('INSUFFICIENT_CREDITS');

  let created: BirthProfileRow;
  try {
    created = await createBirthProfile(user.id, body);
  } catch (err) {
    await addWalletBalance(user.id, PROFILE_CREATION_COST_PAISE, 'refund:profile_creation').catch(
      () => {},
    );
    throw err;
  }

  let activated = true;
  try {
    await updateUserById(user.id, { activeProfileId: created.id });
  } catch (err) {
    activated = false;
    logger.error(
      { err, userId: user.id, birthProfileId: created.id },
      'profile-create: activation update failed after profile was created',
    );
  }

  void requestKundliGeneration(user.id, created.id).catch((err: unknown) => {
    logger.error(
      { err, userId: user.id, birthProfileId: created.id },
      'profile-create: kundli background generation errored',
    );
  });

  return additionalProfileDto(created, activated);
}

/**
 * Switches the user's active profile. The literal string `'primary'` is a
 * route-boundary sentinel only — it doesn't exist in the DB or in
 * `ProfileContext`/`resolveActiveProfileContext`, which use `null` for "the
 * primary profile is active" (see `profile-context.ts`). `id === 'primary'`
 * clears `activeProfileId` back to that `null`; any other `id` must be an
 * owned, non-deleted `birth_profiles` row — 404s otherwise.
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
