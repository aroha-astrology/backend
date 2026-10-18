import type { BirthProfileRow, UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import crypto from 'node:crypto';
import {
  addWalletBalance,
  claimFreeProfileSlot,
  deductWalletBalance,
  refundKeyFor,
  releaseFreeProfileSlot,
  updateUserById,
} from '../users/users.repo.js';
import { isFeatureOn, priceOf } from '../features/features.service.js';
import { hasPass } from '../../lib/entitlements.js';
import { FREE_PROFILE_SLOTS } from '../../config/money.js';
import { grantSignupStage } from '../rewards/signup-drip.js';
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

/**
 * Fail-open fallback only. The charged amount is the admin-set
 * `paid.profileCreation` price resolved via `priceOf()` — never this constant.
 */
export const PROFILE_CREATION_FALLBACK_PAISE = 20000;

/** Fail-open fallback for `money.profileExtra`, the price after the free slots while money.freeProfiles is on. */
export const PROFILE_EXTRA_FALLBACK_PAISE = 9900;

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
  // Admin-set price, resolved once and reused for the refund below — the
  // onboarding screen quotes this same resolved value via
  // useFeature('paid.profileCreation'), so the two can't drift.
  //
  // With money.freeProfiles on (v7 offer): the first FREE_PROFILE_SLOTS extra profiles cost nothing,
  // then a Pass member adds them free, and anyone else pays `money.profileExtra`. With it off the
  // price is exactly what it always was.
  let pricePaise = await priceOf(
    user.id,
    'paid.profileCreation',
    PROFILE_CREATION_FALLBACK_PAISE,
  );
  let tookFreeSlot = false;
  if (await isFeatureOn(user.id, 'money.freeProfiles')) {
    if (await claimFreeProfileSlot(user.id, FREE_PROFILE_SLOTS)) {
      tookFreeSlot = true;
      pricePaise = 0;
    } else if (await hasPass(user.id)) {
      pricePaise = 0;
    } else {
      pricePaise = await priceOf(user.id, 'money.profileExtra', PROFILE_EXTRA_FALLBACK_PAISE);
    }
  }

  // One key per attempt: the refund below carries the matching refund key, so a charge can be
  // given back once and only once, even if this code path is ever retried.
  const chargeKey = `profile_creation:${crypto.randomUUID()}`;
  if (pricePaise > 0) {
    const charged = await deductWalletBalance(user.id, pricePaise, 'profile_creation', {
      idempotencyKey: chargeKey,
    });
    if (!charged) throw Errors.conflict('INSUFFICIENT_CREDITS');
  }

  let created: BirthProfileRow;
  try {
    created = await createBirthProfile(user.id, body);
  } catch (err) {
    if (pricePaise > 0) {
      await addWalletBalance(user.id, pricePaise, 'refund:profile_creation', {
        idempotencyKey: refundKeyFor(chargeKey),
      }).catch(() => {});
    }
    if (tookFreeSlot) await releaseFreeProfileSlot(user.id).catch(() => {});
    throw err;
  }

  // Stage 3 of the 3-stage signup bonus (money.signupDrip): the first extra profile. A no-op for
  // everyone who did not sign up under it, and for the second profile onward.
  void grantSignupStage(user.id, 3);

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
