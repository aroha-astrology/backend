import { logger } from '../../lib/logger.js';
import { Errors } from '../../lib/errors.js';
import type { UserRow } from '../../db/schema.js';
import { findUserByPhoneE164 } from '../users/users.repo.js';
import { resolveProfileContext, type ProfileContext } from '../birth-profiles/profile-context.js';
import { findKundliByUserId, listKundlisByUserId } from '../kundli/kundli.repo.js';
import { regenerateDoshaForUser } from '../kundli/kundli.service.js';
import { listHoroscopesByUserId } from '../horoscope/horoscope.repo.js';
import {
  HOROSCOPE_PERIODS,
  currentPeriodStart,
  requestHoroscopeGeneration,
} from '../horoscope/horoscope.service.js';
import { requestGemstoneGeneration } from '../gemstone/gemstone.service.js';
import {
  countActiveDeviceTokensByPlatform,
  findActiveTokensForUser,
} from '../device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import type { AdminRegenerateCategory, AdminUserInspection } from './admin.schemas.js';

/** Shared lookup for every admin route keyed by phone — 404s on an unknown or soft-deleted phone. */
export async function findAdminTargetUser(phone: string): Promise<UserRow> {
  const user = await findUserByPhoneE164(phone);
  if (!user || user.deletedAt !== null) {
    throw Errors.notFound(`No user found with phone ${phone}`);
  }
  return user;
}

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/users/{phone}/inspect                                        */
/* -------------------------------------------------------------------------- */

export async function inspectUserByPhone(phone: string): Promise<AdminUserInspection> {
  const user = await findAdminTargetUser(phone);

  const [kundliRows, horoscopeRows] = await Promise.all([
    listKundlisByUserId(user.id),
    listHoroscopesByUserId(user.id),
  ]);

  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      phoneE164: user.phoneE164,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      timeOfBirth: user.timeOfBirth,
      placeOfBirth: user.placeOfBirth,
      onboardingStatus: user.onboardingStatus,
      walletBalancePaise: user.walletBalancePaise,
      unlockedHouses: user.unlockedHouses,
      gemstoneUnlockedAt: user.gemstoneUnlockedAt ? user.gemstoneUnlockedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
    },
    kundlis: kundliRows.map((k) => ({
      birthProfileId: k.birthProfileId,
      status: k.status,
      error: k.error,
      updatedAt: k.updatedAt.toISOString(),
      chartData: k.chartData,
      dashaData: k.dashaData,
      yogaData: k.yogaData,
      doshaData: k.doshaData,
      ashtakavargaData: k.ashtakavargaData,
    })),
    horoscopes: horoscopeRows.map((h) => ({
      birthProfileId: h.birthProfileId,
      period: h.period,
      forDate: h.forDate,
      periodKey: h.periodKey,
      status: h.status,
      model: h.model,
      summary: h.summary,
      structured: h.structured,
      monthlyBreakdown: h.monthlyBreakdown,
      error: h.error,
      updatedAt: h.updatedAt.toISOString(),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* POST /v1/admin/users/{phone}/notify                                        */
/* -------------------------------------------------------------------------- */

export interface AdminNotifyResult {
  tokenCount: number;
  success: number;
  failure: number;
}

export async function notifyUserByPhone(
  phone: string,
  title: string,
  body: string,
): Promise<AdminNotifyResult> {
  const user = await findAdminTargetUser(phone);
  // Reuses the device-tokens module's own active-token lookup — deliberately
  // more correct than scripts/notify-user-by-phone.ts's raw query (which
  // doesn't filter pushEnabled), since this actually sends a push.
  const tokens = await findActiveTokensForUser(user.id);
  if (tokens.length === 0) return { tokenCount: 0, success: 0, failure: 0 };

  const { success, failure } = await sendPushBatch(
    tokens.map((t) => t.token),
    title,
    body,
  );
  return { tokenCount: tokens.length, success, failure };
}

/* -------------------------------------------------------------------------- */
/* POST /v1/admin/users/{phone}/regenerate                                    */
/* -------------------------------------------------------------------------- */

/** Mirrors scripts/regenerate-one-user.ts: every period, force:true, one bounded attempt each (no retryForever — this runs unattended in the background). */
async function regenerateHoroscopesForUser(user: UserRow, profile: ProfileContext): Promise<void> {
  for (const period of HOROSCOPE_PERIODS) {
    try {
      await requestHoroscopeGeneration(user, profile, period, {
        forDate: currentPeriodStart(period),
        force: true,
      });
    } catch (err) {
      logger.error({ err, userId: user.id, period }, 'admin regenerate: horoscope period failed');
    }
  }
}

/** Mirrors scripts/regenerate-all-doshas.ts's per-row logic, scoped to this one user's kundli. */
async function regenerateDoshaTaskForUser(user: UserRow, profile: ProfileContext): Promise<void> {
  try {
    await regenerateDoshaForUser(user.id, profile.birthProfileId);
  } catch (err) {
    logger.error({ err, userId: user.id }, 'admin regenerate: dosha failed');
  }
}

/** Mirrors scripts/regenerate-gemstone-all.ts's per-target logic: no-op if there's no ready kundli yet. */
async function regenerateGemstoneForUser(user: UserRow, profile: ProfileContext): Promise<void> {
  const kundli = await findKundliByUserId(user.id, profile.birthProfileId);
  if (!kundli || kundli.status !== 'ready') return;
  try {
    await requestGemstoneGeneration(
      user.id,
      profile.birthProfileId,
      { chartData: kundli.chartData },
      { force: true },
    );
  } catch (err) {
    logger.error({ err, userId: user.id }, 'admin regenerate: gemstone failed');
  }
}

/**
 * Kicks off the requested category's regeneration task(s) WITHOUT awaiting
 * them — same fire-and-forget + catch-and-log convention as
 * prime-reports.service.ts's unlockReport/fireGeneration. Each task above
 * additionally catches its own errors internally, so one failing
 * period/profile never aborts the others.
 */
function dispatchRegeneration(
  user: UserRow,
  profile: ProfileContext,
  category: AdminRegenerateCategory,
): void {
  if (category === 'horoscope' || category === 'all') {
    void regenerateHoroscopesForUser(user, profile);
  }
  if (category === 'dosha' || category === 'all') {
    void regenerateDoshaTaskForUser(user, profile);
  }
  if (category === 'gemstone' || category === 'all') {
    void regenerateGemstoneForUser(user, profile);
  }
}

/**
 * Validates the target user exists (awaited — so the route can 404), then
 * fires the actual regeneration in the background and returns immediately.
 */
export async function startRegeneration(
  phone: string,
  category: AdminRegenerateCategory,
): Promise<void> {
  const user = await findAdminTargetUser(phone);
  // This admin route isn't profile-aware — always regenerates the primary/
  // self profile, matching every existing regenerate-*.ts script's behavior.
  const profile = await resolveProfileContext(user, null);
  dispatchRegeneration(user, profile, category);
}

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/device-tokens/stats                                          */
/* -------------------------------------------------------------------------- */

export interface AdminDeviceTokenStats {
  total: number;
  byPlatform: Record<string, number>;
}

export async function getDeviceTokenStats(): Promise<AdminDeviceTokenStats> {
  const rows = await countActiveDeviceTokensByPlatform();
  const byPlatform: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byPlatform[row.platform] = row.count;
    total += row.count;
  }
  return { total, byPlatform };
}
