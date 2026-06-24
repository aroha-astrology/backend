import type { BirthProfileRow, NewBirthProfileRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import type {
  BirthProfileDto,
  CreateBirthProfileBody,
  UpdateBirthProfileBody,
} from './birth-profiles.schemas.js';
import {
  findOwnedBirthProfile,
  insertBirthProfile,
  listBirthProfilesByOwner,
  softDeleteOwnedBirthProfile,
  updateOwnedBirthProfile,
} from './birth-profiles.repo.js';

export function toBirthProfileDto(row: BirthProfileRow): BirthProfileDto {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    relationship: row.relationship,
    displayName: row.displayName,
    gender: row.gender,
    dateOfBirth: row.dateOfBirth,
    timeOfBirth: row.timeOfBirth,
    placeOfBirth: row.placeOfBirth,
    birthTimeAccuracy: row.birthTimeAccuracy,
    birthTimeSource: row.birthTimeSource,
    birthLocationAccuracy: row.birthLocationAccuracy,
    gotra: row.gotra,
    addedWithConsent: row.addedWithConsent,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const DIRECT_FIELDS = [
  'relationship',
  'displayName',
  'gender',
  'dateOfBirth',
  'timeOfBirth',
  'placeOfBirth',
  'birthTimeAccuracy',
  'birthTimeSource',
  'birthLocationAccuracy',
  'gotra',
  'addedWithConsent',
  'notes',
] as const satisfies readonly (keyof NewBirthProfileRow &
  keyof (CreateBirthProfileBody | UpdateBirthProfileBody))[];

function buildPatch(
  body: UpdateBirthProfileBody | CreateBirthProfileBody,
): Partial<NewBirthProfileRow> {
  const out: Partial<NewBirthProfileRow> = {};
  for (const key of DIRECT_FIELDS) {
    const value = (body as Record<string, unknown>)[key];
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export async function createBirthProfile(
  ownerUserId: string,
  body: CreateBirthProfileBody,
): Promise<BirthProfileRow> {
  return insertBirthProfile({ ownerUserId, ...buildPatch(body) });
}

export async function listBirthProfiles(ownerUserId: string): Promise<BirthProfileRow[]> {
  return listBirthProfilesByOwner(ownerUserId);
}

export async function getBirthProfile(ownerUserId: string, id: string): Promise<BirthProfileRow> {
  const row = await findOwnedBirthProfile(id, ownerUserId);
  if (!row) throw Errors.notFound('Birth profile not found');
  return row;
}

export async function updateBirthProfile(
  ownerUserId: string,
  id: string,
  body: UpdateBirthProfileBody,
): Promise<BirthProfileRow> {
  const row = await updateOwnedBirthProfile(id, ownerUserId, buildPatch(body));
  if (!row) throw Errors.notFound('Birth profile not found');
  return row;
}

export async function deleteBirthProfile(ownerUserId: string, id: string): Promise<void> {
  const row = await softDeleteOwnedBirthProfile(id, ownerUserId);
  if (!row) throw Errors.notFound('Birth profile not found');
}
