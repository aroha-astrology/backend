import { and, eq, getTableColumns, inArray, isNull, ne, or } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  devicePushTokens,
  users,
  type DevicePushTokenRow,
  type NewDevicePushTokenRow,
} from '../../db/schema.js';

/**
 * Every push in the product — per-user (`notifyUser`) and broadcast alike —
 * resolves its tokens through the two functions below, so this is the one
 * place that has to know about accounts on their way out. A user with a
 * pending deletion request gets no notifications of any kind: no transit
 * pre-alerts, no broadcasts, no low-balance nudges. Rejecting the request
 * clears the flag and everything resumes, with no token re-registration
 * needed — which is why this is a join rather than revoking their tokens.
 */
const notAwaitingDeletion = isNull(users.deletionRequestedAt);

export async function findActiveTokenRow(token: string): Promise<DevicePushTokenRow | undefined> {
  const rows = await db
    .select()
    .from(devicePushTokens)
    .where(and(eq(devicePushTokens.token, token), isNull(devicePushTokens.revokedAt)))
    .limit(1);
  return rows[0];
}

/**
 * Active (unrevoked) tokens for a user that haven't explicitly opted out of
 * push. `pushEnabled` is nullable (unknown OS-permission state) — NULL is
 * treated as "enabled" (three-valued SQL logic means a plain `!= false`
 * would silently drop NULL rows, so this is spelled out as an OR instead).
 */
export async function findActiveTokensForUser(userId: string): Promise<DevicePushTokenRow[]> {
  return db
    .select(getTableColumns(devicePushTokens))
    .from(devicePushTokens)
    .innerJoin(users, eq(users.id, devicePushTokens.userId))
    .where(
      and(
        eq(devicePushTokens.userId, userId),
        isNull(devicePushTokens.revokedAt),
        or(isNull(devicePushTokens.pushEnabled), eq(devicePushTokens.pushEnabled, true)),
        notAwaitingDeletion,
      ),
    );
}

export async function getAllActiveTokens(): Promise<DevicePushTokenRow[]> {
  return db
    .select(getTableColumns(devicePushTokens))
    .from(devicePushTokens)
    .innerJoin(users, eq(users.id, devicePushTokens.userId))
    .where(
      and(
        isNull(devicePushTokens.revokedAt),
        or(isNull(devicePushTokens.pushEnabled), eq(devicePushTokens.pushEnabled, true)),
        notAwaitingDeletion,
      ),
    );
}

export async function insertDeviceToken(
  values: NewDevicePushTokenRow,
): Promise<DevicePushTokenRow> {
  const [row] = await db.insert(devicePushTokens).values(values).returning();
  if (!row) throw new Error('Failed to insert device token');
  return row;
}

export async function updateDeviceTokenById(
  id: string,
  patch: Partial<NewDevicePushTokenRow>,
): Promise<DevicePushTokenRow | undefined> {
  const [row] = await db
    .update(devicePushTokens)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(devicePushTokens.id, id))
    .returning();
  return row;
}

/** Revoke any other active token rows for the same physical device. */
export async function revokeOtherTokensForDevice(
  userId: string,
  deviceId: string,
  exceptToken: string,
): Promise<void> {
  await db
    .update(devicePushTokens)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(devicePushTokens.userId, userId),
        eq(devicePushTokens.deviceId, deviceId),
        ne(devicePushTokens.token, exceptToken),
        isNull(devicePushTokens.revokedAt),
      ),
    );
}

/** Bulk-revoke tokens FCM reports as permanently dead (e.g. app uninstalled). */
export async function revokeTokensByValue(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db
    .update(devicePushTokens)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(inArray(devicePushTokens.token, tokens), isNull(devicePushTokens.revokedAt)));
}

export async function revokeOwnedDeviceToken(
  id: string,
  userId: string,
): Promise<DevicePushTokenRow | undefined> {
  const [row] = await db
    .update(devicePushTokens)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(devicePushTokens.id, id),
        eq(devicePushTokens.userId, userId),
        isNull(devicePushTokens.revokedAt),
      ),
    )
    .returning();
  return row;
}
