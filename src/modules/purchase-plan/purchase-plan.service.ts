import { logger } from '../../lib/logger.js';
import { Errors } from '../../lib/errors.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { getPanchang } from '../astro/astro.service.js';
import {
  generatePurchasePlanAnalysis,
  translatePurchasePlanContent,
} from '../../lib/llm/purchase-plan.js';
import { resolveDates, todayIso } from './purchase-plan.dates.js';
import {
  insertPendingPlan,
  listPlansForUser,
  findPlanForUser,
  countRecentPlansForUser,
  markProcessing,
  markDone,
  markError,
  deletePlanForUser,
  savePurchasePlanTranslation,
} from './purchase-plan.repo.js';
import type { PurchasePlanRow } from '../../db/schema.js';
import type { AnalyzePurchasePlanBody, PurchasePlanDto } from './purchase-plan.schemas.js';
import { findActiveTokensForUser } from '../device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';

const REFERENCE_LAT = 28.6139;
const REFERENCE_LON = 77.209;
const DAILY_PLAN_LIMIT = 3;

const CATEGORY_LABELS: Record<'vehicle' | 'home' | 'commercial' | 'other', string> = {
  vehicle: 'vehicle',
  home: 'home',
  commercial: 'property',
  other: 'purchase',
};

/**
 * Best-effort push notification once a purchase-plan analysis is done.
 * Follows the same fire-and-forget, never-throws contract as
 * `pushDailyHoroscopeReady` in horoscope.service.ts.
 * Exported so it can be unit-tested in isolation.
 */
export async function notifyPurchasePlanReady(
  userId: string,
  category: 'vehicle' | 'home' | 'commercial' | 'other',
): Promise<void> {
  try {
    const tokens = await findActiveTokensForUser(userId);
    if (tokens.length === 0) return;
    const label = CATEGORY_LABELS[category];
    await sendPushBatch(
      tokens.map((t) => t.token),
      '🔮 Your Vedic timing analysis is ready',
      `Your auspicious ${label} purchase timing report is waiting — tap to read it now.`,
      { type: 'purchase_plan_ready', navigate: '/panchang#purchase-plans' },
    );
    logger.info({ userId, category }, 'purchase-plan:push sent');
  } catch (err) {
    logger.warn({ err, userId }, 'purchase-plan:push failed');
  }
}

/** Best-effort extraction from the loosely-typed kundli jsonb blobs — falls back to a generic line if fields are absent. */
function buildChartContext(kundli: Awaited<ReturnType<typeof findKundliByUserId>>): string {
  if (!kundli || kundli.status !== 'ready') {
    return 'No birth chart is available for this user yet — analyze based on panchang timing alone.';
  }
  const dasha = kundli.dashaData as {
    currentMahadasha?: { lord?: string };
    currentAntardasha?: { lord?: string };
  } | null;
  const chart = kundli.chartData as {
    ascendant?: { sign?: string };
    planets?: Array<{ planet: string; sign: string; house?: number }>;
  } | null;

  const lines: string[] = [];
  if (chart?.ascendant?.sign) lines.push(`Ascendant: ${chart.ascendant.sign}`);
  if (dasha?.currentMahadasha?.lord)
    lines.push(`Current Mahadasha: ${dasha.currentMahadasha.lord}`);
  if (dasha?.currentAntardasha?.lord)
    lines.push(`Current Antardasha: ${dasha.currentAntardasha.lord}`);
  if (chart?.planets?.length) {
    lines.push(
      'Planet placements: ' +
        chart.planets
          .map((p) => `${p.planet} in ${p.sign}${p.house ? ` (house ${p.house})` : ''}`)
          .join(', '),
    );
  }
  return lines.length > 0
    ? lines.join('\n')
    : 'No birth chart is available for this user yet — analyze based on panchang timing alone.';
}

export async function requestPurchasePlanAnalysis(
  userId: string,
  body: AnalyzePurchasePlanBody,
): Promise<{ planId: string }> {
  const recentCount = await countRecentPlansForUser(userId, 24);
  if (recentCount >= DAILY_PLAN_LIMIT) {
    throw Errors.tooManyRequests(
      `You've reached today's limit of ${DAILY_PLAN_LIMIT} purchase-timing analyses. Try again tomorrow.`,
    );
  }

  const { resolvedBookingDate, resolvedDeliveryDate } = resolveDates(
    body.bookingDate,
    body.deliveryDate,
  );
  const kundli = await findKundliByUserId(userId);

  const row = await insertPendingPlan({
    userId,
    chartId: kundli?.id ?? null,
    category: body.category,
    metadata: body.metadata,
    costBracket: body.costBracket ?? null,
    bookingDate: body.bookingDate ?? null,
    deliveryDate: body.deliveryDate ?? null,
    resolvedBookingDate,
    resolvedDeliveryDate,
    panchangDate: body.panchangDate ?? todayIso(),
    language: body.language,
    status: 'pending',
  });

  // Fire-and-forget: the app runs single-instance under pm2 (-i 1), so an
  // in-process background task survives until it finishes without needing a
  // separate job queue — see docs/superpowers/specs/2026-07-04-panchang-parity-design.md.
  void processAnalysis(row.id, userId, {
    category: body.category,
    metadata: body.metadata,
    costBracket: body.costBracket,
    resolvedBookingDate,
    resolvedDeliveryDate,
    bookingDateProvided: !!body.bookingDate,
    deliveryDateProvided: !!body.deliveryDate,
    language: body.language,
    chartContext: buildChartContext(kundli),
  }).catch((err) => {
    logger.error({ err, planId: row.id }, 'purchase plan background processing failed');
  });

  return { planId: row.id };
}

async function processAnalysis(
  planId: string,
  userId: string,
  input: {
    category: 'vehicle' | 'home' | 'commercial' | 'other';
    metadata: Record<string, string>;
    costBracket?: string | undefined;
    resolvedBookingDate: string;
    resolvedDeliveryDate: string;
    bookingDateProvided: boolean;
    deliveryDateProvided: boolean;
    language: string;
    chartContext: string;
  },
): Promise<void> {
  await markProcessing(planId);
  try {
    const [bookingPanchang, deliveryPanchang] = await Promise.all([
      getPanchang(REFERENCE_LAT, REFERENCE_LON, input.resolvedBookingDate),
      getPanchang(REFERENCE_LAT, REFERENCE_LON, input.resolvedDeliveryDate),
    ]);

    const { analysis } = await generatePurchasePlanAnalysis({
      ...input,
      bookingPanchang: bookingPanchang,
      deliveryPanchang: deliveryPanchang,
    });
    await markDone(planId, analysis);
    void notifyPurchasePlanReady(userId, input.category).catch(() => {
      /* already logged */
    });
  } catch (err) {
    logger.error({ err, planId }, 'purchase plan LLM analysis failed');
    await markError(planId, err instanceof Error ? err.message : 'Unknown error');
  }
}

export function toPurchasePlanDto(row: PurchasePlanRow): PurchasePlanDto {
  return {
    id: row.id,
    category: row.category,
    metadata: row.metadata,
    costBracket: row.costBracket,
    resolvedBookingDate: row.resolvedBookingDate,
    resolvedDeliveryDate: row.resolvedDeliveryDate,
    status: row.status,
    analysis: row.analysis,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function toPurchasePlanDtoForLanguage(
  row: PurchasePlanRow,
  language: string = 'en',
): Promise<PurchasePlanDto> {
  const baseDto = toPurchasePlanDto(row);

  if (language === 'en' || !baseDto.analysis || baseDto.status !== 'done') {
    return baseDto;
  }

  if (row.translations && row.translations[language]) {
    return { ...baseDto, analysis: row.translations[language] };
  }

  try {
    const translated = await translatePurchasePlanContent(baseDto.analysis, language);
    await savePurchasePlanTranslation(row.id, language, translated);
    return { ...baseDto, analysis: translated };
  } catch (err) {
    logger.warn({ err, planId: row.id, language }, 'failed to translate purchase plan analysis');
    return baseDto;
  }
}

export async function getPlansForUser(
  userId: string,
  language: string = 'en',
): Promise<PurchasePlanDto[]> {
  const rows = await listPlansForUser(userId);
  return Promise.all(rows.map((r) => toPurchasePlanDtoForLanguage(r, language)));
}

export async function getPlanForUser(
  id: string,
  userId: string,
  language: string = 'en',
): Promise<PurchasePlanDto> {
  const row = await findPlanForUser(id, userId);
  if (!row) throw Errors.notFound('Purchase plan not found');
  return toPurchasePlanDtoForLanguage(row, language);
}

export async function removePlanForUser(id: string, userId: string): Promise<void> {
  const row = await findPlanForUser(id, userId);
  if (!row) throw Errors.notFound('Purchase plan not found');
  await deletePlanForUser(id, userId);
}
