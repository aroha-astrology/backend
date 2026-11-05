import type { BirthProfileRow, NewBirthProfileRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { requestKundliGeneration } from '../kundli/kundli.service.js';
import { deleteHouseInsightsForUser } from '../kundli/house-insight.repo.js';
import { deleteGemstoneForUser } from '../gemstone/gemstone.repo.js';
import { deleteRemedyInsightForUser } from '../astro/remedy-insight.repo.js';
import { deleteHoroscopesForProfile } from '../horoscope/horoscope.repo.js';
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

/** The fields a chart, and everything built from it, depends on. */
const BIRTH_DETAIL_FIELDS = [
  'dateOfBirth',
  'timeOfBirth',
  'placeOfBirth',
  'birthTimeAccuracy',
] as const;

/**
 * Throws away what was built from the old birth details of a saved profile and starts its chart
 * again (audit M16). Chat, voice, reports and the horoscope read the saved chart, so without this
 * they kept the OLD chart until someone opened that profile's Kundli screen. Fire and forget: the
 * edit itself is already saved, and a failure here must never undo or fail it. The chart rebuild
 * clears the horoscopes a second time once it is done, as every rebuild does.
 */
async function invalidateAfterBirthEdit(ownerUserId: string, id: string): Promise<void> {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['horoscopes', () => deleteHoroscopesForProfile(ownerUserId, id)],
    ['house insights', () => deleteHouseInsightsForUser(ownerUserId, id)],
    ['gemstone', () => deleteGemstoneForUser(ownerUserId, id)],
    ['remedy insight', () => deleteRemedyInsightForUser(ownerUserId, id)],
    ['kundli rebuild', () => requestKundliGeneration(ownerUserId, id)],
  ];
  const results = await Promise.allSettled(steps.map(([, run]) => run()));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      logger.error(
        { err: r.reason, userId: ownerUserId, profileId: id, step: steps[i]?.[0] },
        'invalidation after a saved profile’s birth-detail edit failed',
      );
    }
  });
}

export async function updateBirthProfile(
  ownerUserId: string,
  id: string,
  body: UpdateBirthProfileBody,
): Promise<BirthProfileRow> {
  // Only a real change counts: saving the same time again must not wipe readings and cost a rebuild.
  const before = BIRTH_DETAIL_FIELDS.some((f) => body[f] !== undefined)
    ? await findOwnedBirthProfile(id, ownerUserId)
    : undefined;
  const row = await updateOwnedBirthProfile(id, ownerUserId, buildPatch(body));
  if (!row) throw Errors.notFound('Birth profile not found');
  const changed = BIRTH_DETAIL_FIELDS.some(
    (f) => body[f] !== undefined && JSON.stringify(body[f]) !== JSON.stringify(before?.[f]),
  );
  if (changed) void invalidateAfterBirthEdit(ownerUserId, id);
  return row;
}

export async function deleteBirthProfile(ownerUserId: string, id: string): Promise<void> {
  const row = await softDeleteOwnedBirthProfile(id, ownerUserId);
  if (!row) throw Errors.notFound('Birth profile not found');
}
