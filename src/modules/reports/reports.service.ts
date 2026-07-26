// =============================================================================
// Reports feature — generic purchase + generation orchestration
// =============================================================================
// This module never knows anything report-type-specific — it only calls
// through the ReportGenerator contract (report-generator.types.ts). Adding a
// new report type (past_life, wealth, the *_monthly reports, etc.) means
// registering a new generator (see modules/reports/generators/index.ts); this
// file does not change.
// =============================================================================

import '../reports/generators/index.js';
import { logger } from '../../lib/logger.js';
import { Errors } from '../../lib/errors.js';
import { MODEL } from '../../config/llm.js';
import {
  getReportDef,
  monthlyBundlePricePaise,
  REPORT_CATALOGUE,
  type ReportDef,
  type ReportKey,
} from '../../config/reports.js';
import { resolveFeaturesForUser } from '../features/features.service.js';
import { deductWalletBalance, addWalletBalance } from '../users/users.repo.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { resolveProfileContext } from '../birth-profiles/profile-context.js';
import { computeMetrology } from '../../lib/swarm/agents/metrologist.js';
import type { BirthRecord } from '../../lib/swarm/state.js';
import {
  claimReportRow,
  findReportById,
  findReportRow,
  findStaleGeneratingReports,
  listReportsForUser,
  markReportFailed,
  markReportReady,
  saveReportTranslation,
} from './reports.repo.js';
import { REPORT_GENERATORS, type ReportSection } from './report-generator.types.js';
import type { UserRow, ReportRow } from '../../db/schema.js';
import type {
  PurchaseReportBody,
  PurchasedReportSummaryDto,
  ReportCatalogueEntryDto,
  ReportDto,
} from './reports.schemas.js';
import { findActiveTokensForUser } from '../device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

function monthKeyToDate(monthKey: string): string {
  return `${monthKey}-01`;
}

/** Inverse of monthKeyToDate — tolerates any 'YYYY-MM-DD' string, not just '-01'. */
function dateToMonthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * Reason string for the AGGREGATE wallet debit at purchase time — matches the
 * prior admin task's `parseReason` regex in modules/billing/billing.service.ts
 * (`/^report_unlock:([a-z_]+)(?::(\d{4}-\d{2}))?(?::bundle:(\d+))?$/`) exactly:
 * one-time -> `report_unlock:<key>`, a single purchased month -> the `:<YYYY-MM>`
 * suffix, 2+ months -> the `:bundle:<N>` suffix (never both suffixes at once).
 */
function reasonForPurchase(reportKey: string, months: string[]): string {
  if (months.length === 0) return `report_unlock:${reportKey}`;
  if (months.length === 1) return `report_unlock:${reportKey}:${months[0]}`;
  return `report_unlock:${reportKey}:bundle:${months.length}`;
}

/** Reason string for a refund tied to ONE specific row (duplicate-purchase reuse, or a
 * background generation failure) — always the single-month/one-time shape, even when that
 * row was originally purchased as part of a multi-month bundle, for precise ledger tracing. */
function reasonForRow(reportKey: string, periodMonth: string | null): string {
  if (periodMonth === null) return `report_unlock:${reportKey}`;
  return `report_unlock:${reportKey}:${dateToMonthKey(periodMonth)}`;
}

function validatePurchaseShape(def: ReportDef, body: PurchaseReportBody): void {
  const months = body.months ?? [];
  if (def.isMonthly && months.length === 0) {
    throw Errors.badRequest(`${def.key} is a monthly report — "months" (YYYY-MM[]) is required`);
  }
  if (!def.isMonthly && months.length > 0) {
    throw Errors.badRequest(`${def.key} is a one-time report and does not accept "months"`);
  }
  for (const m of months) {
    if (!MONTH_KEY_RE.test(m)) {
      throw Errors.badRequest(`Invalid month "${m}" in "months" — expected YYYY-MM`);
    }
  }
  if (def.requiresPartner && !body.partner) {
    throw Errors.badRequest(`${def.key} requires "partner" birth details`);
  }
  if (!def.requiresPartner && body.partner) {
    throw Errors.badRequest(`${def.key} does not accept "partner" birth details`);
  }
}

/** Remainder paise land on the first row — arbitrary but documented, and never off by
 * more than (rowCount - 1) paise in total, which is immaterial at these price points. */
function splitPriceAcrossRows(totalPaise: number, rowCount: number): number[] {
  const base = Math.floor(totalPaise / rowCount);
  const remainder = totalPaise - base * rowCount;
  return Array.from({ length: rowCount }, (_, i) => (i === 0 ? base + remainder : base));
}

/**
 * Per-row prices for this purchase. One-time reports (including kundli_milan)
 * are a single flat row at the resolved per-unit price. Monthly reports scale
 * the WHOLE monthlyBundlePricePaise(N) curve by the ratio of the admin's
 * resolved per-month price override to the catalogue's own base per-month
 * price (`perUnitPricePaise / def.basePricePaise`) — e.g. if the admin
 * doubles the per-month price, the entire bundle ladder (₹25/₹45/.../₹199)
 * doubles too, keeping the SAME relative discount curve at any base price.
 * Scaling a monotonically non-decreasing sequence by any positive constant,
 * then rounding (Math.round is itself monotonic non-decreasing), preserves
 * monotonicity — so "N+1 months never costs less than N months" holds
 * regardless of what the admin has set the per-month price to. The final
 * total is rounded exactly once (not per-row) to avoid compounding rounding
 * error before the remainder-on-first-row split below.
 */
function computeRowPrices(def: ReportDef, perUnitPricePaise: number, rowCount: number): number[] {
  if (!def.isMonthly) return [perUnitPricePaise];
  const ratio = perUnitPricePaise / def.basePricePaise;
  const totalPaise = Math.round(monthlyBundlePricePaise(rowCount) * ratio);
  return splitPriceAcrossRows(totalPaise, rowCount);
}

export function partnerInputToBirthRecord(input: Record<string, unknown>): BirthRecord {
  return {
    date: input.dateOfBirth as string,
    time: input.timeOfBirth as string,
    latitude: input.latitude as number,
    longitude: input.longitude as number,
    timezone: input.timezone as string,
  };
}

/**
 * Best-effort push notification once a purchased report finishes generating.
 * Follows the exact fire-and-forget, never-throws contract as
 * `notifyPurchasePlanReady` in purchase-plan.service.ts — a notification
 * failure here must never affect the report's own generated/ready outcome.
 */
export async function notifyReportReady(
  userId: string,
  reportKey: string,
  reportId: string,
): Promise<void> {
  try {
    const tokens = await findActiveTokensForUser(userId);
    if (tokens.length === 0) return;
    const label = getReportDef(reportKey)?.label ?? 'report';
    await sendPushBatch(
      tokens.map((t) => t.token),
      `🔮 Your ${label} is ready`,
      'Tap to read your report now.',
      { type: 'report_ready', navigate: `/reports/${reportId}` },
    );
    logger.info({ userId, reportId, reportKey }, 'report:push sent');
  } catch (err) {
    logger.warn({ err, userId, reportId }, 'report:push failed');
  }
}

/**
 * Background generation for one already-claimed row. Fire-and-forget from
 * the purchase route — never awaited in the request/response cycle. Any
 * failure along this path (no chart yet, no registered generator for this
 * key, a bad partner birth record, the LLM call itself failing) is treated
 * uniformly: mark the row `failed` with a clear error and refund THIS row's
 * price share. This is the safety net documented on REPORT_GENERATORS — a
 * report key with no registered generator fails exactly the same way as any
 * other generation failure, never crashing the process.
 */
async function runReportGeneration(row: ReportRow, birthProfileId: string | null): Promise<void> {
  const claimedAt = row.startedAt;
  if (!claimedAt) return; // claimReportRow always sets this when it returns a row — defensive only.

  try {
    const generator = REPORT_GENERATORS[row.reportKey as ReportKey];
    if (!generator) {
      throw new Error(`No generator registered for report key "${row.reportKey}"`);
    }

    const kundli = await findKundliByUserId(row.userId, birthProfileId);
    if (!kundli || kundli.status !== 'ready' || !kundli.chartData) {
      throw new Error('Birth chart is not ready yet');
    }

    let partnerChart: Record<string, unknown> | null = null;
    if (row.input) {
      const metrology = await computeMetrology(partnerInputToBirthRecord(row.input));
      partnerChart = (metrology.chart as Record<string, unknown> | undefined) ?? null;
    }

    const scores = generator.computeScores(
      {
        chart: kundli.chartData,
        partnerChart,
        doshaData: kundli.doshaData ?? null,
        yogaData: kundli.yogaData ?? null,
        ashtakavargaData: kundli.ashtakavargaData ?? null,
        dashaData: kundli.dashaData ?? null,
      },
      row.periodMonth,
    );
    const sections = await generator.generateNarrative(scores, 'en');

    await markReportReady(row.id, claimedAt, {
      content: { sections },
      model: MODEL,
    });
    void notifyReportReady(row.userId, row.reportKey, row.id).catch(() => {
      /* already logged */
    });
  } catch (err) {
    logger.error(
      { err, reportId: row.id, reportKey: row.reportKey },
      'report background generation failed',
    );
    await markReportFailed(row.id, claimedAt, err instanceof Error ? err.message : String(err));
    await addWalletBalance(
      row.userId,
      row.pricePaidPaise,
      `refund:${reasonForRow(row.reportKey, row.periodMonth)}`,
    ).catch((refundErr: unknown) =>
      logger.error({ err: refundErr, reportId: row.id }, 'report generation refund failed'),
    );
  }
}

/** Kick off background generation without blocking the caller. */
function fireReportGeneration(row: ReportRow, birthProfileId: string | null): void {
  void runReportGeneration(row, birthProfileId).catch((err: unknown) => {
    logger.error({ err, reportId: row.id }, 'report background generation errored unexpectedly');
  });
}

export interface PurchaseReportResult {
  reports: PurchasedReportSummaryDto[];
}

export async function purchaseReport(
  user: UserRow,
  body: PurchaseReportBody,
): Promise<PurchaseReportResult> {
  const def = getReportDef(body.reportKey);
  if (!def) throw Errors.notFound(`Unknown report key: ${body.reportKey}`);

  const features = await resolveFeaturesForUser(user.id);
  if (features[def.featureFlagKey]?.enabled === false) {
    throw Errors.forbidden('FEATURE_DISABLED');
  }

  validatePurchaseShape(def, body);

  const profile = await resolveProfileContext(user, body.birthProfileId ?? null);
  const birthProfileId = profile.birthProfileId;

  const perUnitPricePaise = features[def.featureFlagKey]?.pricePaise ?? def.basePricePaise;
  const months = body.months ?? [];
  const periodMonths: (string | null)[] = def.isMonthly ? months.map(monthKeyToDate) : [null];
  const rowPrices = computeRowPrices(def, perUnitPricePaise, periodMonths.length);
  const totalPricePaise = rowPrices.reduce((a, b) => a + b, 0);
  const partnerInput = def.requiresPartner
    ? ((body.partner as unknown as Record<string, unknown>) ?? null)
    : null;
  const purchaseReason = reasonForPurchase(def.key, months);

  const charged = await deductWalletBalance(user.id, totalPricePaise, purchaseReason);
  if (!charged) throw Errors.conflict('INSUFFICIENT_CREDITS');

  const summaries: PurchasedReportSummaryDto[] = [];
  let processedCount = 0;

  try {
    for (let i = 0; i < periodMonths.length; i++) {
      const periodMonth = periodMonths[i] ?? null;
      const rowPrice = rowPrices[i] ?? 0;

      const claimed = await claimReportRow({
        userId: user.id,
        birthProfileId,
        reportKey: def.key,
        periodMonth,
        input: partnerInput,
        pricePaidPaise: rowPrice,
      });

      if (claimed) {
        summaries.push({
          id: claimed.id,
          reportKey: def.key,
          periodMonth: claimed.periodMonth,
          status: claimed.status,
        });
        fireReportGeneration(claimed, birthProfileId);
      } else {
        // Already purchased & ready/in-flight for this exact identity — the DB layer
        // guaranteed no duplicate row was inserted (see claimReportRow's doc comment).
        // Reuse it and refund this row's share rather than double-charging.
        const existing = await findReportRow(user.id, birthProfileId, def.key, periodMonth);
        if (existing) {
          summaries.push({
            id: existing.id,
            reportKey: def.key,
            periodMonth: existing.periodMonth,
            status: existing.status,
          });
        }
        await addWalletBalance(
          user.id,
          rowPrice,
          `refund:${reasonForRow(def.key, periodMonth)}`,
        ).catch(() => {});
      }
      processedCount = i + 1;
    }
  } catch (err) {
    // A DB error inserting/claiming a row this purchase hadn't reached yet — refund exactly
    // the unprocessed rows' share (rows already claimed/refunded above keep their own outcome).
    const unrefunded = rowPrices.slice(processedCount).reduce((a, b) => a + b, 0);
    if (unrefunded > 0) {
      await addWalletBalance(user.id, unrefunded, `refund:${purchaseReason}`).catch(() => {});
    }
    throw err;
  }

  return { reports: summaries };
}

export async function getReportCatalogueForUser(
  user: UserRow,
  birthProfileId: string | null,
): Promise<ReportCatalogueEntryDto[]> {
  const [features, rows] = await Promise.all([
    resolveFeaturesForUser(user.id),
    listReportsForUser(user.id, birthProfileId),
  ]);

  return REPORT_CATALOGUE.map((def) => {
    const resolved = features[def.featureFlagKey];
    return {
      key: def.key,
      label: def.label,
      isMonthly: def.isMonthly,
      requiresPartner: def.requiresPartner,
      enabled: resolved?.enabled ?? true,
      pricePaise: resolved?.pricePaise ?? def.basePricePaise,
      purchases: rows
        .filter((r) => r.reportKey === def.key)
        .map((r) => ({ id: r.id, periodMonth: r.periodMonth, status: r.status })),
    };
  });
}

async function recomputeScoresForRead(row: ReportRow): Promise<Record<string, unknown>> {
  const generator = REPORT_GENERATORS[row.reportKey as ReportKey];
  if (!generator) return {};

  const kundli = await findKundliByUserId(row.userId, row.birthProfileId);
  const chart = kundli?.chartData ?? null;

  let partnerChart: Record<string, unknown> | null = null;
  if (row.input) {
    try {
      const metrology = await computeMetrology(partnerInputToBirthRecord(row.input));
      partnerChart = (metrology.chart as Record<string, unknown> | undefined) ?? null;
    } catch (err) {
      logger.warn({ err, reportId: row.id }, 'failed to recompute partner chart on read');
    }
  }

  return generator.computeScores(
    {
      chart,
      partnerChart,
      doshaData: kundli?.doshaData ?? null,
      yogaData: kundli?.yogaData ?? null,
      ashtakavargaData: kundli?.ashtakavargaData ?? null,
      dashaData: kundli?.dashaData ?? null,
    },
    row.periodMonth,
  );
}

/**
 * The report DTO in the requested language — mirrors gemstone's
 * toGemstoneReportDtoForLanguage translate-on-read pattern exactly: `scores`
 * are ALWAYS recomputed fresh from the live chart (never trusted from the
 * persisted row, see recomputeScoresForRead), English sections return
 * as-is, and any other language checks `translations[language]` first,
 * falling back to a single LLM translation call (cached after) and finally
 * to the English narrative if translation itself fails.
 */
export async function getReportForUser(
  id: string,
  userId: string,
  language: string,
): Promise<ReportDto> {
  const row = await findReportById(id);
  // 404, not 403, on a row that exists but belongs to someone else — avoids leaking existence.
  if (!row || row.userId !== userId) throw Errors.notFound('Report not found');

  if (row.status === 'generating') return { status: 'generating' };
  if (row.status === 'failed') return { status: 'failed', error: row.error };

  const scores = await recomputeScoresForRead(row);
  const content = (row.content ?? {}) as { sections?: ReportSection[] };
  const englishSections = content.sections ?? [];
  const generator = REPORT_GENERATORS[row.reportKey as ReportKey];

  const readyBase = {
    status: 'ready' as const,
    reportKey: row.reportKey,
    periodMonth: row.periodMonth,
    scores,
  };

  if (language === 'en' || !generator) {
    return { ...readyBase, sections: englishSections };
  }

  const cached = row.translations?.[language] as { sections?: ReportSection[] } | undefined;
  if (cached?.sections) {
    return { ...readyBase, sections: cached.sections };
  }

  try {
    const translated = await generator.translateNarrative(englishSections, language);
    await saveReportTranslation(row.id, language, { sections: translated });
    return { ...readyBase, sections: translated };
  } catch (err) {
    logger.warn({ err, reportId: row.id, language }, 'failed to translate report');
    return { ...readyBase, sections: englishSections };
  }
}

/**
 * Periodic sweep for rows abandoned mid-generation (the Node process crashed
 * or was killed after `claimReportRow` but before `markReportReady`/
 * `markReportFailed`) — see `findStaleGeneratingReports`'s doc comment for
 * why this active sweep is needed on top of claimReportRow's own staleness
 * check. Driven by the OS crontab hitting POST /cron/reports-reap-stale
 * (see cron.routes.ts) rather than an in-process timer, matching every other
 * periodic job in this codebase. Never throws — a failure reaping one row is
 * logged and the sweep continues with the rest.
 */
export async function reapStaleReports(): Promise<{ reaped: number }> {
  const staleRows = await findStaleGeneratingReports();
  let reaped = 0;

  for (const row of staleRows) {
    if (!row.startedAt) continue; // claimReportRow always stamps 'generating' rows with startedAt — defensive only.
    try {
      await markReportFailed(row.id, row.startedAt, 'Generation timed out (stale)');
      await addWalletBalance(
        row.userId,
        row.pricePaidPaise,
        `refund:${reasonForRow(row.reportKey, row.periodMonth)}`,
      ).catch((refundErr: unknown) =>
        logger.error({ err: refundErr, reportId: row.id }, 'stale report reap refund failed'),
      );
      reaped++;
    } catch (err) {
      logger.error({ err, reportId: row.id, reportKey: row.reportKey }, 'stale report reap failed');
    }
  }

  return { reaped };
}
