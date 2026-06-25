import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  devicePushTokens,
  type DevicePushTokenRow,
  type NewDevicePushTokenRow,
} from '../../db/schema.js';

export async function findActiveTokenRow(token: string): Promise<DevicePushTokenRow | undefined> {
  const rows = await db
    .select()
    .from(devicePushTokens)
    .where(and(eq(devicePushTokens.token, token), isNull(devicePushTokens.revokedAt)))
    .limit(1);
  return rows[0];
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
