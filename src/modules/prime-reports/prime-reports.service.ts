import { logger } from '../../lib/logger.js';
import { getPrimeReportDefinition } from './prime-reports.registry.js';
import {
  claimPrimeReportGeneration,
  findPrimeReport,
  markPrimeReportFailed,
  markPrimeReportReady,
  savePrimeReportTranslation,
  unlockPrimeReport,
  PRIME_REPORT_STALE_GENERATING_MS,
} from './prime-reports.repo.js';
import type { ProfileContext } from '../birth-profiles/profile-context.js';
import type { PrimeReportRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import type { PrimeReportDefinition } from './prime-reports.registry.js';

/** Sentinel `period` for one-time-unlock reports (as opposed to 'YYYY-MM' for monthly reports, added in a later phase). */
export const LIFETIME_PERIOD = 'lifetime';

export type UnlockResult = 'unlocked' | 'already_unlocked_or_insufficient_balance';

/**
 * A period is valid for a report type if it's the universal default
 * ('lifetime') OR explicitly declared in that report's `allowedPeriods`.
 * Report types that never declare `allowedPeriods` (all 13 existing ones as
 * of this writing) can therefore ONLY ever be unlocked/generated under
 * 'lifetime' — this is what stops a client from unlocking, say, numerology
 * twice by passing an arbitrary ?period= value and getting double-charged.
 */
function isPeriodAllowed(def: PrimeReportDefinition, period: string): boolean {
  return def.allowedPeriods ? def.allowedPeriods.includes(period) : period === LIFETIME_PERIOD;
}

async function runGeneration(
  userId: string,
  birthProfileId: string | null,
  reportType: string,
  period: string,
  claimedAt: Date,
  profile: ProfileContext,
): Promise<void> {
  const def = getPrimeReportDefinition(reportType);
  if (!def) return;
  try {
    const { content, model } = await def.generate(userId, profile, period);
    await markPrimeReportReady(userId, birthProfileId, reportType, period, claimedAt, {
      analysis: content,
      model,
    });
  } catch (err) {
    logger.error({ err, userId, birthProfileId, reportType }, 'prime report generation failed');
    await markPrimeReportFailed(
      userId,
      birthProfileId,
      reportType,
      period,
      claimedAt,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Spend wallet balance to unlock `reportType` for the profile in `profile`,
 * then fire generation in the background. Idempotent: a second call while
 * already unlocked (or with too little balance) safely no-ops via
 * `unlockPrimeReport`'s combined existence-check + debit.
 */
export async function unlockReport(
  userId: string,
  profile: ProfileContext,
  reportType: string,
  period: string = LIFETIME_PERIOD,
): Promise<UnlockResult> {
  const def = getPrimeReportDefinition(reportType);
  if (!def) throw new Error(`Unknown report type: ${reportType}`);
  if (!isPeriodAllowed(def, period)) {
    throw Errors.badRequest(`Report type "${reportType}" does not support period "${period}"`);
  }

  const row = await unlockPrimeReport(
    userId,
    profile.birthProfileId,
    reportType,
    period,
    def.pricePaise,
  );
  if (!row?.startedAt) return 'already_unlocked_or_insufficient_balance';

  void runGeneration(
    userId,
    profile.birthProfileId,
    reportType,
    period,
    row.startedAt,
    profile,
  ).catch((err: unknown) => {
    logger.error({ err, userId, reportType }, 'prime report background generation errored');
  });
  return 'unlocked';
}

/**
 * Fire-and-forget entry point used by the GET route (cache miss/retry) — one
 * bounded attempt, same as gemstone's requestGemstoneGeneration.
 */
export async function requestReportGeneration(
  userId: string,
  profile: ProfileContext,
  reportType: string,
  period: string = LIFETIME_PERIOD,
  opts: { force?: boolean } = {},
): Promise<'generated' | 'skipped'> {
  const claimed = await claimPrimeReportGeneration(
    userId,
    profile.birthProfileId,
    reportType,
    period,
    opts.force ? { force: true } : {},
  );
  if (!claimed?.startedAt) return 'skipped';
  await runGeneration(
    userId,
    profile.birthProfileId,
    reportType,
    period,
    claimed.startedAt,
    profile,
  );
  return 'generated';
}

export function isReportStale(row: PrimeReportRow): boolean {
  return (
    row.status === 'generating' &&
    row.startedAt !== null &&
    Date.now() - row.startedAt.getTime() > PRIME_REPORT_STALE_GENERATING_MS
  );
}

export { findPrimeReport };

export interface PrimeReportDto {
  status: 'ready';
  reportType: string;
  content: Record<string, unknown>;
}

/**
 * The report dto in the requested language. English (or no language) returns
 * the canonical stored content as-is. Otherwise checks the cached
 * `translations` map first; on a miss, translates via the registry's
 * `translate()` and persists it — same translate-on-read pattern as
 * gemstone's toGemstoneReportDtoForLanguage. A translation failure logs and
 * falls back to the untranslated content.
 */
export async function toReportDtoForLanguage(
  row: PrimeReportRow,
  reportType: string,
  language: string,
): Promise<PrimeReportDto> {
  const base = row.analysis ?? {};

  if (language === 'en') {
    return { status: 'ready', reportType, content: base };
  }

  const def = getPrimeReportDefinition(reportType);
  if (!def) throw new Error(`Unknown report type: ${reportType}`);

  const cached = row.translations?.[language];
  if (cached) {
    return { status: 'ready', reportType, content: cached };
  }

  try {
    const translated = await def.translate(base, language);
    await savePrimeReportTranslation(
      row.userId,
      row.birthProfileId,
      reportType,
      row.period,
      language,
      translated,
    );
    return { status: 'ready', reportType, content: translated };
  } catch (err) {
    logger.warn(
      { err, userId: row.userId, reportType, language },
      'failed to translate prime report',
    );
    return { status: 'ready', reportType, content: base };
  }
}
