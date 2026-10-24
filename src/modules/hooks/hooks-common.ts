// =============================================================================
// Daily-return hooks — shared service helpers (v7 spec, Sprint 6)
// =============================================================================
// Where the reader is, what an unlock costs and who gets it free, and how a hook push is sent under
// the daily cap and quiet hours. Every hook service builds on these four things.
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { passEntitlement } from '../../lib/entitlements.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { dateInZone, INDIA_TZ, userZone } from '../../lib/user-time-zone.js';
import { isValidTimeZone } from '../astro/astro.service.js';
import { isFeatureOn, priceOf } from '../features/features.service.js';
import { addWalletBalance, deductWalletBalance, refundKeyFor } from '../users/users.repo.js';
import { clampPushCap, hookSwitch, HOOK_PUSH_TYPE, underCap, walletKeyFor, type HookName } from './hooks-rules.js';
import { hasUnlock, insertUnlock, logPush, pushCountOn, readSettings, deleteUnlock, getProgress } from './hooks.repo.js';

export interface Place {
  lat: number;
  lon: number;
  tz: string;
  name: string | null;
  /** True when no place of the reader's own was known and Delhi was used. */
  assumed: boolean;
}

export interface PlaceQuery {
  lat?: number;
  lon?: number;
  tz?: string;
}

const DELHI = { lat: 28.61, lon: 77.21 };

/**
 * The place a hook reads the sky at: what the app sent (its sky place), else the saved home city or
 * the device position per the reader's sky mode, else Delhi with `assumed` set. The zone comes from the
 * request only when it came with coordinates; a saved place keeps its own zone, and Delhi keeps IST.
 */
export function resolvePlace(user: UserRow, q: PlaceQuery = {}): Place {
  const validTz = q.tz && isValidTimeZone(q.tz) ? q.tz : undefined;
  if (typeof q.lat === 'number' && typeof q.lon === 'number') {
    return { lat: q.lat, lon: q.lon, tz: validTz ?? userZone(user.currentTimezone), name: null, assumed: false };
  }
  const synced = user.skyMode === 'TRAVEL_SYNCED';
  const pick = synced ? (user.currentLocation ?? user.homeLocation) : (user.homeLocation ?? user.currentLocation);
  if (pick && typeof pick.lat === 'number' && typeof pick.lon === 'number') {
    const placeTz = (pick as { tz?: string | null }).tz;
    return {
      lat: pick.lat,
      lon: pick.lon,
      // the place's own zone: times for a home city must not be shifted onto the device's clock
      tz: placeTz && isValidTimeZone(placeTz) ? placeTz : (validTz ?? userZone(user.currentTimezone)),
      name: pick.name ?? null,
      assumed: false,
    };
  }
  // no place known at all: New Delhi on India's clock, so the times and the place agree
  return { ...DELHI, tz: INDIA_TZ, name: null, assumed: true };
}

/** The reader's own local date at `now` on the zone. */
export function localDateFor(zone: string, now: Date): string {
  return dateInZone(now, zone);
}

export async function hookOn(userId: string, hook: HookName): Promise<boolean> {
  return isFeatureOn(userId, hookSwitch(hook));
}

/** The 403 an endpoint answers while the hook's switch is off for this reader. */
export async function requireHook(userId: string, hook: HookName): Promise<void> {
  if (!(await hookOn(userId, hook))) throw Errors.forbidden('This feature is not available yet');
}

/* ------------------------------------------------------------------ unlocks */

export interface SpendOptions {
  hook: HookName;
  /** Idempotency id, see refFor(). */
  ref: string;
  /** Admin price key, in paise (100 paise = 1 coin). */
  priceKey: string;
  fallbackPaise: number;
  /** Gold and Platinum members open it free. */
  freeForPass?: boolean;
  reason: string;
}

export interface SpendResult {
  /** Paise charged by this call; 0 when it was free or already opened. */
  chargedPaise: number;
  alreadyOpen: boolean;
  free: boolean;
}

/**
 * Opens something that costs coins, once per `ref`. Already opened -> no charge. Pass members of the
 * allowed tiers pay nothing. The charge and the unlock row use the same ref, and a failure after
 * the charge gives the coins back with the matching refund key.
 */
export async function spendOnce(user: UserRow, opts: SpendOptions): Promise<SpendResult> {
  if (await hasUnlock(user.id, opts.hook, opts.ref)) return { chargedPaise: 0, alreadyOpen: true, free: false };

  if (opts.freeForPass) {
    const ent = await passEntitlement(user.id).catch(() => null);
    if (ent && (ent.tier === 'gold' || ent.tier === 'platinum' || ent.tier === null)) {
      await insertUnlock(user.id, opts.hook, opts.ref, 0);
      return { chargedPaise: 0, alreadyOpen: false, free: true };
    }
  }

  const price = await priceOf(user.id, opts.priceKey, opts.fallbackPaise);
  if (price <= 0) {
    await insertUnlock(user.id, opts.hook, opts.ref, 0);
    return { chargedPaise: 0, alreadyOpen: false, free: true };
  }
  const key = walletKeyFor(opts.ref);
  const charged = await deductWalletBalance(user.id, price, opts.reason, { idempotencyKey: key });
  if (!charged) throw Errors.conflict('INSUFFICIENT_CREDITS');
  try {
    await insertUnlock(user.id, opts.hook, opts.ref, Math.round(price / 100));
  } catch (err) {
    await addWalletBalance(user.id, price, `refund:${opts.reason}`, { idempotencyKey: refundKeyFor(key) }).catch(() => {});
    await deleteUnlock(user.id, opts.hook, opts.ref).catch(() => {});
    throw err;
  }
  return { chargedPaise: price, alreadyOpen: false, free: false };
}

/* --------------------------------------------------------------------- push */

export async function pushCap(): Promise<number> {
  try {
    return clampPushCap((await readSettings()).pushCap);
  } catch {
    return clampPushCap(undefined);
  }
}

/** Has the reader turned this hook's push off (Settings -> Notifications)? */
export async function hookPushOff(userId: string, hook: HookName): Promise<boolean> {
  const row = await getProgress(userId, '_prefs', '', '-');
  const off = (row?.data as { off?: string[] } | undefined)?.off ?? [];
  return off.includes(hook);
}

export interface HookPush {
  hook: HookName;
  title: string;
  body: string;
  link: string;
}

/**
 * Sends one hook push if the hook is on for this reader, they have not switched it off, and fewer than
 * the daily cap (3 unless the owner changed it) have gone out today. Quiet hours and the master
 * "hooks" notification toggle are applied by notifyUser. Returns whether a push went out.
 */
export async function sendHookPush(user: UserRow, push: HookPush, now: Date = new Date()): Promise<boolean> {
  try {
    if (!(await hookOn(user.id, push.hook))) return false;
    if (await hookPushOff(user.id, push.hook)) return false;
    const localDate = dateInZone(now, resolvePlace(user).tz);
    if (!underCap(await pushCountOn(user.id, localDate), await pushCap())) return false;
    await logPush(user.id, localDate, push.hook);
    await notifyUser(user.id, {
      title: push.title,
      body: push.body,
      type: HOOK_PUSH_TYPE[push.hook],
      link: push.link,
    });
    return true;
  } catch (err) {
    logger.warn({ err, userId: user.id, hook: push.hook }, 'hooks: push skipped');
    return false;
  }
}
