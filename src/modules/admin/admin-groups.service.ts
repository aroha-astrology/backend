import { FEATURE_REGISTRY, isKnownFeatureKey } from '../../config/features.js';
import { Errors } from '../../lib/errors.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { invalidateGroupOverrideCache } from '../features/features.service.js';
import {
  createGroup,
  listGroupsWithMemberCount,
  deleteGroup,
  addMember,
  removeMember,
  listMembers,
  upsertGroupFeatureOverride,
  deleteGroupFeatureOverride,
  listGroupFeatureOverrides,
} from '../user-groups/user-groups.repo.js';
import { logAdminAction } from './admin.repo.js';

/* -------------------------------------------------------------------------- */
/* Groups                                                                     */
/* -------------------------------------------------------------------------- */

export interface AdminGroupDto {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  createdBy: string | null;
  memberCount: number;
}

export async function listGroupsForAdmin(): Promise<AdminGroupDto[]> {
  const rows = await listGroupsWithMemberCount();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    memberCount: row.memberCount,
  }));
}

/**
 * `user_groups_name_unique` (case-insensitive, on `lower(name)`) is the
 * source of truth for duplicate detection — this catches the resulting
 * Postgres unique-violation and turns it into a clean 400 rather than a raw
 * 500, same idiom as `users.service.ts#updateMe`'s email-conflict handling
 * (though that one maps to 409; the group-creation spec calls for 400 here).
 */
export async function createGroupForAdmin(
  name: string,
  description: string | null | undefined,
  adminPhone: string,
): Promise<AdminGroupDto> {
  let row;
  try {
    row = await createGroup(name, description ?? null, adminPhone);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw Errors.badRequest(`A group named "${name}" already exists`);
    }
    throw err;
  }

  await logAdminAction(adminPhone, 'POST /v1/admin/groups', {
    name,
    description: description ?? null,
  });

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    // A brand-new group has no members yet — no need to re-query the count.
    memberCount: 0,
  };
}

/** Cascades to members + overrides via FK — see user_group_members/feature_flag_group_overrides `onDelete: 'cascade'`. */
export async function deleteGroupForAdmin(id: string, adminPhone: string): Promise<void> {
  await deleteGroup(id);
  // The deleted group's override rows are gone too (cascade) — drop the
  // cached snapshot so a straggling read within the TTL window can't serve them.
  invalidateGroupOverrideCache();
  await logAdminAction(adminPhone, `DELETE /v1/admin/groups/${id}`, {});
}

/* -------------------------------------------------------------------------- */
/* Members                                                                    */
/* -------------------------------------------------------------------------- */

export interface AdminGroupMemberDto {
  userId: string;
  displayName: string | null;
  phoneE164: string | null;
  addedAt: string;
}

export async function listMembersForAdmin(groupId: string): Promise<AdminGroupMemberDto[]> {
  const rows = await listMembers(groupId);
  return rows.map((row) => ({ ...row, addedAt: row.addedAt.toISOString() }));
}

export async function addMemberForAdmin(
  groupId: string,
  userId: string,
  adminPhone: string,
): Promise<void> {
  await addMember(groupId, userId);
  await logAdminAction(adminPhone, `POST /v1/admin/groups/${groupId}/members`, { userId });
}

export async function removeMemberForAdmin(
  groupId: string,
  userId: string,
  adminPhone: string,
): Promise<void> {
  await removeMember(groupId, userId);
  await logAdminAction(adminPhone, `DELETE /v1/admin/groups/${groupId}/members/${userId}`, {});
}

/* -------------------------------------------------------------------------- */
/* Group feature overrides                                                    */
/* -------------------------------------------------------------------------- */

/** A group either explicitly overrides a feature (true/false) or 'inherit's the global default. */
export type GroupFeatureState = 'inherit' | boolean;

export interface AdminGroupFeatureRow {
  key: string;
  label: string;
  group: string;
  state: GroupFeatureState;
  /** This group's model override; null = inherit the global model (always null for a
   * non-model-picker key). See FeatureDef.modelOptions. */
  model: string | null;
  /** Non-empty only for model-picker keys. */
  modelOptions: string[];
}

/** Every FEATURE_REGISTRY entry, annotated with this group's own override (or 'inherit' if it has none). */
export async function listGroupFeaturesForAdmin(groupId: string): Promise<AdminGroupFeatureRow[]> {
  const overrides = await listGroupFeatureOverrides(groupId);
  const byKey = new Map(overrides.map((o) => [o.featureKey, o]));

  return FEATURE_REGISTRY.map((feature) => {
    const override = byKey.get(feature.key);
    return {
      key: feature.key,
      label: feature.label,
      group: feature.group,
      state: override ? override.enabled : 'inherit',
      // Only meaningful while the group's own override is enabled — an
      // 'inherit'/disabled row shows no model of its own to pick from.
      // Falls back to the registry's defaultModel (same chain
      // admin.service.ts#listFeaturesForAdmin uses for the global row) so an
      // admin flipping a group's toggle on for the first time sees a sane
      // pre-selected option, not an empty dropdown.
      model: override?.enabled ? (override.model ?? feature.defaultModel ?? null) : null,
      modelOptions: [...(feature.modelOptions ?? [])],
    };
  });
}

/**
 * `enabled: null` clears the override (the key falls back to 'inherit');
 * `enabled: true | false` upserts it. `model` is the group's COMPLETE
 * intended choice for this write (see UpdateGroupFeatureBodySchema's own doc
 * comment — unlike the global PUT /admin/features, there is no "leave
 * untouched" case here), and is rejected when it's not one of the key's own
 * `modelOptions` — a typo'd model id would fail every request from every
 * user in this group. Rejects an unknown key up front, same as
 * `admin.service.ts#updateFeature` — FEATURE_REGISTRY is the source of truth
 * for what keys exist.
 */
export async function updateGroupFeatureForAdmin(
  groupId: string,
  key: string,
  enabled: boolean | null,
  adminPhone: string,
  model: string | null = null,
): Promise<AdminGroupFeatureRow> {
  if (!isKnownFeatureKey(key)) {
    throw Errors.badRequest(`Unknown feature key "${key}"`);
  }
  const registryEntry = FEATURE_REGISTRY.find((feature) => feature.key === key)!;

  if (model != null && !(registryEntry.modelOptions ?? []).includes(model)) {
    throw Errors.badRequest(`Model "${model}" is not an option for feature "${key}"`);
  }

  if (enabled === null) {
    await deleteGroupFeatureOverride(groupId, key);
  } else {
    await upsertGroupFeatureOverride(groupId, key, enabled, adminPhone, model);
  }
  invalidateGroupOverrideCache();
  await logAdminAction(adminPhone, `PUT /v1/admin/groups/${groupId}/features`, {
    key,
    enabled,
    model,
  });

  return {
    key,
    label: registryEntry.label,
    group: registryEntry.group,
    state: enabled === null ? 'inherit' : enabled,
    model: enabled === true ? model : null,
    modelOptions: [...(registryEntry.modelOptions ?? [])],
  };
}
