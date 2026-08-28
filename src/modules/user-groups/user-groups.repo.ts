import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { decryptField } from '../../lib/crypto/field-encryption.js';
import {
  userGroups,
  userGroupMembers,
  featureFlagGroupOverrides,
  users,
  type UserGroupRow,
  type FeatureFlagGroupOverrideRow,
} from '../../db/schema.js';

/* -------------------------------------------------------------------------- */
/* Groups                                                                     */
/* -------------------------------------------------------------------------- */

export async function createGroup(
  name: string,
  description: string | null,
  createdBy: string | null,
): Promise<UserGroupRow> {
  const [row] = await db.insert(userGroups).values({ name, description, createdBy }).returning();
  return row!;
}

/** Every group, unfiltered. See `listGroupsWithMemberCount` for the admin-dashboard shape. */
export async function listGroups(): Promise<UserGroupRow[]> {
  return db.select().from(userGroups);
}

export interface GroupWithMemberCount extends UserGroupRow {
  memberCount: number;
}

/** Powers `GET /v1/admin/groups` — one query, no N+1 per group. */
export async function listGroupsWithMemberCount(): Promise<GroupWithMemberCount[]> {
  const rows = await db
    .select({
      id: userGroups.id,
      name: userGroups.name,
      description: userGroups.description,
      createdAt: userGroups.createdAt,
      createdBy: userGroups.createdBy,
      memberCount: sql<number>`count(${userGroupMembers.userId})`,
    })
    .from(userGroups)
    .leftJoin(userGroupMembers, eq(userGroupMembers.groupId, userGroups.id))
    .groupBy(userGroups.id)
    .orderBy(userGroups.createdAt);

  return rows.map((row) => ({ ...row, memberCount: Number(row.memberCount) }));
}

/** Cascades to `user_group_members` and `feature_flag_group_overrides` via their FK `onDelete: 'cascade'`. */
export async function deleteGroup(id: string): Promise<void> {
  await db.delete(userGroups).where(eq(userGroups.id, id));
}

/* -------------------------------------------------------------------------- */
/* Members                                                                    */
/* -------------------------------------------------------------------------- */

/** Idempotent — a second add for the same (groupId, userId) pair is a silent no-op. */
export async function addMember(groupId: string, userId: string): Promise<void> {
  await db
    .insert(userGroupMembers)
    .values({ groupId, userId })
    .onConflictDoNothing({ target: [userGroupMembers.groupId, userGroupMembers.userId] });
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  await db
    .delete(userGroupMembers)
    .where(and(eq(userGroupMembers.groupId, groupId), eq(userGroupMembers.userId, userId)));
}

export interface GroupMemberRow {
  userId: string;
  displayName: string | null;
  phoneE164: string | null;
  addedAt: Date;
}

/** `phoneE164` is encrypted at rest — decrypted here the same way `listUsersPage` does, never returned raw. */
export async function listMembers(groupId: string): Promise<GroupMemberRow[]> {
  const rows = await db
    .select({
      userId: userGroupMembers.userId,
      displayName: users.displayName,
      phoneE164: users.phoneE164,
      addedAt: userGroupMembers.addedAt,
    })
    .from(userGroupMembers)
    .innerJoin(users, eq(users.id, userGroupMembers.userId))
    .where(eq(userGroupMembers.groupId, groupId));

  return rows.map((row) => ({ ...row, phoneE164: decryptField(row.phoneE164) }));
}

/**
 * The hot-path lookup — called on every `/v1/me` (via `resolveFeaturesForUser`)
 * and every `requireFeature` check. Single indexed query on
 * `user_group_members_user_id_idx`, no joins.
 */
export async function listGroupIdsForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ groupId: userGroupMembers.groupId })
    .from(userGroupMembers)
    .where(eq(userGroupMembers.userId, userId));
  return rows.map((row) => row.groupId);
}

/* -------------------------------------------------------------------------- */
/* Group feature overrides                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `model` is resolved by the caller (admin-groups.service.ts#updateGroupFeatureForAdmin) BEFORE
 * this is called — same division of responsibility as upsertFeatureOverride's global counterpart
 * (features.repo.ts): the "undefined preserves the existing choice" convention lives one layer up,
 * this always writes a concrete value. Returns the written row via RETURNING so the caller never
 * needs a second SELECT to report back what it just wrote.
 */
export async function upsertGroupFeatureOverride(
  groupId: string,
  featureKey: string,
  enabled: boolean,
  updatedBy: string | null,
  model: string | null = null,
): Promise<FeatureFlagGroupOverrideRow> {
  const now = new Date();
  const [row] = await db
    .insert(featureFlagGroupOverrides)
    .values({ groupId, featureKey, enabled, updatedBy, updatedAt: now, model })
    .onConflictDoUpdate({
      target: [featureFlagGroupOverrides.groupId, featureFlagGroupOverrides.featureKey],
      set: { enabled, updatedBy, updatedAt: now, model },
    })
    .returning();
  return row!;
}

/** Removing an override returns that key to "inherit from global" for the group — a real third state. */
export async function deleteGroupFeatureOverride(
  groupId: string,
  featureKey: string,
): Promise<void> {
  await db
    .delete(featureFlagGroupOverrides)
    .where(
      and(
        eq(featureFlagGroupOverrides.groupId, groupId),
        eq(featureFlagGroupOverrides.featureKey, featureKey),
      ),
    );
}

export interface GroupFeatureOverride {
  featureKey: string;
  enabled: boolean;
  model: string | null;
}

export async function listGroupFeatureOverrides(groupId: string): Promise<GroupFeatureOverride[]> {
  return db
    .select({
      featureKey: featureFlagGroupOverrides.featureKey,
      enabled: featureFlagGroupOverrides.enabled,
      model: featureFlagGroupOverrides.model,
    })
    .from(featureFlagGroupOverrides)
    .where(eq(featureFlagGroupOverrides.groupId, groupId));
}

export interface AllGroupFeatureOverride {
  groupId: string;
  featureKey: string;
  enabled: boolean;
  model: string | null;
}

/** Every override across every group, in one query — used by `resolveFeaturesForUser`'s own process cache. */
export async function listAllGroupFeatureOverrides(): Promise<AllGroupFeatureOverride[]> {
  return db
    .select({
      groupId: featureFlagGroupOverrides.groupId,
      featureKey: featureFlagGroupOverrides.featureKey,
      enabled: featureFlagGroupOverrides.enabled,
      model: featureFlagGroupOverrides.model,
    })
    .from(featureFlagGroupOverrides);
}
