import type { DevicePushTokenRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import type { DeviceTokenDto, RegisterDeviceTokenBody } from './device-tokens.schemas.js';
import {
  findActiveTokenRow,
  insertDeviceToken,
  revokeOtherTokensForDevice,
  revokeOwnedDeviceToken,
  updateDeviceTokenById,
} from './device-tokens.repo.js';

export function toDeviceTokenDto(row: DevicePushTokenRow): DeviceTokenDto {
  return {
    id: row.id,
    platform: row.platform,
    deviceId: row.deviceId,
    locale: row.locale,
    appVersion: row.appVersion,
    osVersion: row.osVersion,
    pushEnabled: row.pushEnabled,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Register or refresh a push token. Idempotent on the token value: a live
 * token maps to exactly one account, so a re-registration re-points it to the
 * current user and refreshes metadata. When a stable `deviceId` is supplied,
 * the device's previous (rotated) token is revoked so dead rows don't pile up.
 */
export async function registerDeviceToken(
  userId: string,
  body: RegisterDeviceTokenBody,
): Promise<DevicePushTokenRow> {
  const now = new Date();

  if (body.deviceId) {
    await revokeOtherTokensForDevice(userId, body.deviceId, body.token);
  }

  const existing = await findActiveTokenRow(body.token);
  const fields = {
    userId,
    platform: body.platform,
    deviceId: body.deviceId ?? null,
    locale: body.locale ?? null,
    appVersion: body.appVersion ?? null,
    osVersion: body.osVersion ?? null,
    pushEnabled: body.pushEnabled ?? null,
    lastSeenAt: now,
    revokedAt: null,
  };

  if (existing) {
    const updated = await updateDeviceTokenById(existing.id, fields);
    if (!updated) throw Errors.internal('Failed to update device token');
    return updated;
  }

  return insertDeviceToken({ token: body.token, ...fields });
}

export async function revokeDeviceToken(userId: string, id: string): Promise<void> {
  const row = await revokeOwnedDeviceToken(id, userId);
  if (!row) throw Errors.notFound('Device token not found');
}
