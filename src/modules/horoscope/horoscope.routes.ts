import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import {
  GetHoroscopeQuerySchema,
  HoroscopeSchema,
  HoroscopeStatusSchema,
} from './horoscope.schemas.js';
import {
  currentPeriodStart,
  isStaleGenerating,
  periodKeyFor,
  requestHoroscopeGeneration,
  toHoroscopeDto,
} from './horoscope.service.js';
import { findHoroscope, saveHoroscopeTranslation } from './horoscope.repo.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { translateHoroscopeContent } from '../../lib/llm/horoscope.js';
import {
  resolveActiveProfileContext,
  type ProfileContext,
} from '../birth-profiles/profile-context.js';
import type { UserRow } from '../../db/schema.js';
import type { HoroscopePeriod } from './horoscope.schemas.js';

/** Don't re-run a failed generation more often than this. */
const FAILED_RETRY_COOLDOWN_MS = 30_000;

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('Error');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const horoscopeRouter = new OpenAPIHono();

horoscopeRouter.use('*', requireUser);

/** Kick off generation without blocking the response — always retries indefinitely on failure, since nothing else is waiting on this one user's run. */
function fireGeneration(user: UserRow, profile: ProfileContext, period: HoroscopePeriod): void {
  void requestHoroscopeGeneration(user, profile, period, { retryForever: true }).catch(
    (err: unknown) => {
      logger.error({ err, userId: user.id, period }, 'horoscope background generation errored');
    },
  );
}

const getHoroscopeRoute = createRoute({
  method: 'get',
  path: '/horoscope',
  tags: ['Horoscope'],
  summary: "Get the current user's personalized horoscope",
  description:
    'Returns 200 with the horoscope when ready, or 202 while it is still being generated ' +
    '(poll again) — mirrors GET /kundli. Generation is triggered proactively once onboarding ' +
    'completes and by a nightly cron sweep of all 4 periods, so a 202 here should be rare and ' +
    'brief; this endpoint is the always-correct fallback for any gap in that pregeneration.',
  security: [{ bearerAuth: [] }],
  request: { query: GetHoroscopeQuerySchema },
  responses: {
    200: {
      description: 'Horoscope for the requested period',
      content: { 'application/json': { schema: HoroscopeSchema } },
    },
    202: {
      description: 'Generation in progress or the last attempt failed — poll again',
      content: { 'application/json': { schema: HoroscopeStatusSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

horoscopeRouter.openapi(getHoroscopeRoute, async (c) => {
  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  const { period, language } = c.req.valid('query');

  const forDate = currentPeriodStart(period);
  const periodKey = periodKeyFor(period, forDate);
  const existing = await findHoroscope(user.id, profile.birthProfileId, period, periodKey);

  if (!existing) {
    fireGeneration(user, profile, period);
    return c.json({ status: 'generating' as const }, 202);
  }

  if (existing.status === 'ready') {
    const kundli = await findKundliByUserId(user.id, profile.birthProfileId);
    const dashaData = kundli && kundli.status === 'ready' ? kundli.dashaData : null;
    let dto = toHoroscopeDto(existing, dashaData);

    // Query param wins — the in-app language switcher never persists to
    // `user.contentLanguage` (PUT /preferences is a stub), so that field is
    // stale for anyone who changed language mid-session.
    const lang = language || user.contentLanguage || 'en';
    if (lang !== 'en') {
      const translations = existing.translations || {};
      // The dasha reading's mahadashaPlanet/antardashaPlanet/activeUntil are
      // never translated (see translateHoroscopeContent) — only hook/meaning
      // come back from a translation, so merge those onto the existing
      // (English/deterministic) dasha object rather than replacing it.
      const mergeDasha = (t: { dasha?: { hook?: string; meaning?: string } } | undefined) =>
        t?.dasha && dto.dasha ? { ...dto.dasha, ...t.dasha } : dto.dasha;

      if (translations[lang]) {
        const cached = translations[lang];
        dto = { ...dto, ...cached, dasha: mergeDasha(cached) };
      } else {
        try {
          const translated = await translateHoroscopeContent(
            {
              summary: existing.summary,
              structured: existing.structured,
              monthlyBreakdown: existing.monthlyBreakdown,
              ...(dto.dasha ? { dasha: dto.dasha } : {}),
            },
            lang,
          );
          await saveHoroscopeTranslation(
            user.id,
            period,
            periodKey,
            lang,
            translated,
            profile.birthProfileId,
          );
          dto = { ...dto, ...translated, dasha: mergeDasha(translated) };
        } catch (err) {
          logger.warn({ err, userId: user.id, lang }, 'failed to translate horoscope');
        }
      }
    }

    return c.json(dto, 200);
  }

  if (existing.status === 'generating') {
    if (isStaleGenerating(existing)) fireGeneration(user, profile, period);
    return c.json({ status: 'generating' as const }, 202);
  }

  // 'failed'
  if (Date.now() - existing.updatedAt.getTime() > FAILED_RETRY_COOLDOWN_MS) {
    fireGeneration(user, profile, period);
  }
  return c.json({ status: 'failed' as const }, 202);
});
