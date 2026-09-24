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
  findStaleProcessingPlans,
  countRecentPlansForUser,
  markProcessing,
  markDone,
  markError,
  deletePlanForUser,
  savePurchasePlanTranslation,
} from './purchase-plan.repo.js';
import type { PlaceOfBirth, PurchasePlanRow } from '../../db/schema.js';
import type { AnalyzePurchasePlanBody, PurchasePlanDto } from './purchase-plan.schemas.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';

/** Last-resort panchang location (New Delhi), for a user with neither a current location nor a birth place. */
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
  const label = CATEGORY_LABELS[category];
  await notifyUser(userId, {
    title: '🔮 Your Vedic timing analysis is ready',
    body: `Your auspicious ${label} purchase timing report is waiting — tap to read it now.`,
    type: 'purchase_plan_ready',
    link: '/panchang#purchase-plans',
  });
  logger.info({ userId, category }, 'purchase-plan:push sent');
}

/**
 * Where to compute the panchang for a purchase: where the user is now, else
 * where they were born, else New Delhi. Sunrise, Rahu Kaal and every
 * Choghadiya window move with the location, so this used to hand a Kolkata
 * buyer Delhi's timings.
 */
export function panchangLocationFor(user: {
  currentLocation?: Pick<PlaceOfBirth, 'lat' | 'lon'> | null;
  placeOfBirth?: Pick<PlaceOfBirth, 'lat' | 'lon'> | null;
}): { lat: number; lon: number } {
  for (const loc of [user.currentLocation, user.placeOfBirth]) {
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) {
      return { lat: loc.lat, lon: loc.lon };
    }
  }
  return { lat: REFERENCE_LAT, lon: REFERENCE_LON };
}

/** Best-effort extraction from the loosely-typed kundli jsonb blobs — falls back to a generic line if fields are absent. */
export function buildChartContext(kundli: Awaited<ReturnType<typeof findKundliByUserId>>): string {
  if (!kundli || kundli.status !== 'ready') {
    return 'No birth chart is available for this user yet — analyze based on panchang timing alone.';
  }
  // kundli.service.ts stores dashaData as { vimshottari, yogini }, and a
  // period names its lord `planet`. This used to read a top-level
  // `currentMahadasha.lord` that never existed, so the current dasha silently
  // never reached the prompt.
  const dasha = (
    kundli.dashaData as {
      vimshottari?: {
        currentMahadasha?: { planet?: string };
        currentAntardasha?: { planet?: string };
      };
    } | null
  )?.vimshottari;
  const chart = kundli.chartData as {
    ascendant?: { sign?: string };
    planets?: Array<{ planet: string; sign: string; house?: number }>;
  } | null;

  const lines: string[] = [];
  if (chart?.ascendant?.sign) lines.push(`Ascendant: ${chart.ascendant.sign}`);
  if (dasha?.currentMahadasha?.planet)
    lines.push(`Current Mahadasha: ${dasha.currentMahadasha.planet}`);
  if (dasha?.currentAntardasha?.planet)
    lines.push(`Current Antardasha: ${dasha.currentAntardasha.planet}`);
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
  location: { lat: number; lon: number } = { lat: REFERENCE_LAT, lon: REFERENCE_LON },
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
  // Purchase plans aren't profile-aware yet — always the primary/self chart.
  const kundli = await findKundliByUserId(userId, null);

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

  // Fire-and-forget in-process background task — see
  // docs/superpowers/specs/2026-07-04-panchang-parity-design.md. Runs under pm2 cluster mode
  // (`-i max`, see scripts/deploy.sh), so a `pm2 reload` recycling the worker mid-generation
  // kills this task with it — reapStaleProcessingPlans below is what unsticks the row when
  // that happens, not an in-process guarantee.
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
    location,
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
    location: { lat: number; lon: number };
  },
): Promise<void> {
  await markProcessing(planId);
  try {
    const { location, ...analysisInput } = input;
    const [bookingPanchang, deliveryPanchang] = await Promise.all([
      getPanchang(location.lat, location.lon, input.resolvedBookingDate),
      getPanchang(location.lat, location.lon, input.resolvedDeliveryDate),
    ]);

    const { analysis } = await generatePurchasePlanAnalysis({
      ...analysisInput,
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

/**
 * Self-heals any purchase_plans row stuck at 'processing' because the process that claimed it
 * died before reaching markDone/markError. No wallet refund — this feature is free — but
 * without this a stuck row polls forever client-side AND permanently occupies one of the
 * caller's DAILY_PLAN_LIMIT slots (countRecentPlansForUser counts every row regardless of
 * status). Same self-heal as vastu.service.ts's reapStaleVastuPlans, run every 5 minutes via
 * POST /cron/purchase-plan-reap-stale.
 */
export async function reapStaleProcessingPlans(): Promise<{ reaped: number }> {
  const stale = await findStaleProcessingPlans();
  for (const row of stale) {
    await markError(row.id, 'Generation timed out');
  }
  return { reaped: stale.length };
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
    // Keep the raw provider error in the DB column for ops/debugging — never
    // echo it verbatim. Return a safe generic message instead when the plan failed.
    errorMessage:
      row.status === 'error'
        ? 'Analysis failed. Any amount charged has been automatically refunded.'
        : null,
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
