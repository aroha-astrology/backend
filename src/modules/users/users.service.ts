import type { NewUserRow, UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import type { UpdateMeBody, UserDto } from './users.schemas.js';
import { findActiveUserById, softDeleteUserById, updateUserById } from './users.repo.js';

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    firebaseUid: row.firebaseUid,
    phoneE164: row.phoneE164,
    displayName: row.displayName,
    gender: row.gender,
    dateOfBirth: row.dateOfBirth,
    timeOfBirth: row.timeOfBirth,
    placeOfBirth: row.placeOfBirth,
    profileCompletedAt: row.profileCompletedAt ? row.profileCompletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const REQUIRED_PROFILE_FIELDS = [
  'displayName',
  'gender',
  'dateOfBirth',
  'timeOfBirth',
  'placeOfBirth',
] as const;

function isProfileComplete(row: UserRow): boolean {
  return REQUIRED_PROFILE_FIELDS.every((field) => row[field] != null);
}

function patchToRow(patch: UpdateMeBody): Partial<NewUserRow> {
  const out: Partial<NewUserRow> = {};
  if (patch.displayName !== undefined) out.displayName = patch.displayName;
  if (patch.gender !== undefined) out.gender = patch.gender;
  if (patch.dateOfBirth !== undefined) out.dateOfBirth = patch.dateOfBirth;
  if (patch.timeOfBirth !== undefined) out.timeOfBirth = patch.timeOfBirth;
  if (patch.placeOfBirth !== undefined) out.placeOfBirth = patch.placeOfBirth;
  return out;
}

export async function updateMe(userId: string, patch: UpdateMeBody): Promise<UserRow> {
  const current = await findActiveUserById(userId);
  if (!current) throw Errors.notFound('User not found');

  const next = await updateUserById(userId, patchToRow(patch));
  if (!next) throw Errors.notFound('User not found');

  if (next.profileCompletedAt === null && isProfileComplete(next)) {
    const finalized = await updateUserById(userId, { profileCompletedAt: new Date() });
    if (finalized) return finalized;
  }

  return next;
}

export async function deleteMe(userId: string): Promise<void> {
  const current = await findActiveUserById(userId);
  if (!current) throw Errors.notFound('User not found');
  await softDeleteUserById(userId);
}
