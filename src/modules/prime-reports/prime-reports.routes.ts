import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import {
  resolveActiveProfileContext,
  type ProfileContext,
} from '../birth-profiles/profile-context.js';
import { getPrimeReportDefinition, listPrimeReportDefinitions } from './prime-reports.registry.js';
import {
  findPrimeReport,
  isReportStale,
  requestReportGeneration,
  toReportDtoForLanguage,
  unlockReport,
  LIFETIME_PERIOD,
} from './prime-reports.service.js';
import {
  PeriodQuerySchema,
  PrimeReportCatalogueSchema,
  PrimeReportDtoSchema,
  PrimeReportStatusSchema,
  PrimeReportUnlockResponseSchema,
  ReportTypeParamSchema,
} from './prime-reports.schemas.js';
import { LanguageQuerySchema } from '../gemstone/gemstone.schemas.js';
import { renderFlagshipReportPdf } from '../../lib/flagship/pdfRenderer.js';
import type { FlagshipReportContent } from '../../lib/flagship/orchestrator.js';

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

export const primeReportsRouter = new OpenAPIHono();

const FLAGSHIP_PDF_REPORT_TYPE = 'flagship-life-report';

function fireGeneration(
  userId: string,
  profile: ProfileContext,
  reportType: string,
  period: string,
): void {
  void requestReportGeneration(userId, profile, reportType, period).catch((err: unknown) => {
    logger.error({ err, userId, reportType }, 'prime report background generation errored');
  });
}

const catalogueRoute = createRoute({
  method: 'get',
  path: '/prime/reports',
  tags: ['Prime Reports'],
  summary: 'List the Aroha Prime report catalogue with per-report unlock state',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Report catalogue',
      content: { 'application/json': { schema: PrimeReportCatalogueSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

primeReportsRouter.openapi(catalogueRoute, async (c) => {
  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  const defs = listPrimeReportDefinitions();
  const items = await Promise.all(
    defs.map(async (def) => {
      const row = await findPrimeReport(
        user.id,
        profile.birthProfileId,
        def.reportType,
        LIFETIME_PERIOD,
      );
      return {
        reportType: def.reportType,
        title: def.title,
        pricePaise: def.pricePaise,
        unlocked: !!row,
      };
    }),
  );
  return c.json({ items }, 200);
});

const getReportRoute = createRoute({
  method: 'get',
  path: '/prime/reports/{reportType}',
  tags: ['Prime Reports'],
  summary: 'Get a specific Prime report for the active profile',
  description:
    'Returns 200 with the report when ready, 202 while it is still being generated ' +
    '(poll again), or 403 if the report has not been unlocked ' +
    '(spend credits via POST /v1/prime/reports/{reportType}/unlock first).',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    params: ReportTypeParamSchema,
    query: z.object({ ...LanguageQuerySchema.shape, ...PeriodQuerySchema.shape }),
  },
  responses: {
    200: {
      description: 'Prime report',
      content: { 'application/json': { schema: PrimeReportDtoSchema } },
    },
    202: {
      description: 'Generation in progress or last attempt failed — poll again',
      content: { 'application/json': { schema: PrimeReportStatusSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Report is not unlocked'),
    404: errorResponse('Unknown report type'),
  },
});

primeReportsRouter.openapi(getReportRoute, async (c) => {
  const user = c.get('user');
  const { reportType } = c.req.valid('param');
  const { language, period } = c.req.valid('query');
  const effectivePeriod = period ?? LIFETIME_PERIOD;

  if (!getPrimeReportDefinition(reportType)) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: `Unknown report type: ${reportType}` } },
      404,
    );
  }

  const profile = await resolveActiveProfileContext(user);
  const existing = await findPrimeReport(
    user.id,
    profile.birthProfileId,
    reportType,
    effectivePeriod,
  );

  if (!existing) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'This report is not unlocked yet.' } },
      403,
    );
  }

  if (existing.status === 'ready') {
    return c.json(await toReportDtoForLanguage(existing, reportType, language || 'en'), 200);
  }

  if (existing.status === 'generating' && !isReportStale(existing)) {
    return c.json({ status: 'generating' as const }, 202);
  }

  fireGeneration(user.id, profile, reportType, effectivePeriod);
  return c.json({ status: 'generating' as const }, 202);
});

const unlockRoute = createRoute({
  method: 'post',
  path: '/prime/reports/{reportType}/unlock',
  tags: ['Prime Reports'],
  summary: 'Spend wallet credits to unlock a Prime report',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: { params: ReportTypeParamSchema, query: PeriodQuerySchema },
  responses: {
    200: {
      description: 'Unlock result',
      content: { 'application/json': { schema: PrimeReportUnlockResponseSchema } },
    },
    400: errorResponse('Invalid period for this report type'),
    401: errorResponse('Unauthorized'),
    404: errorResponse('Unknown report type'),
    409: errorResponse('Already unlocked or insufficient wallet balance'),
  },
});

primeReportsRouter.openapi(unlockRoute, async (c) => {
  const user = c.get('user');
  const { reportType } = c.req.valid('param');
  const { period } = c.req.valid('query');
  const effectivePeriod = period ?? LIFETIME_PERIOD;

  if (!getPrimeReportDefinition(reportType)) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: `Unknown report type: ${reportType}` } },
      404,
    );
  }

  const profile = await resolveActiveProfileContext(user);
  const result = await unlockReport(user.id, profile, reportType, effectivePeriod);

  if (result === 'already_unlocked_or_insufficient_balance') {
    return c.json(
      { error: { code: 'CONFLICT', message: 'Already unlocked or insufficient wallet balance.' } },
      409,
    );
  }

  return c.json({ status: 'unlocked' as const }, 200);
});

// Plain (non-`.openapi()`) route: this repo has no existing pattern for a
// Zod-validated `application/pdf` binary response, so this follows the
// existing plain-route-with-positional-middleware pattern already used at
// src/modules/telegram-bot/telegram-bot.routes.ts:8 instead of inventing one.
primeReportsRouter.get('/prime/reports/:reportType/pdf', requireUser, async (c) => {
  const reportType = c.req.param('reportType');
  if (reportType !== FLAGSHIP_PDF_REPORT_TYPE) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'PDF rendering is not available for this report type.',
        },
      },
      404,
    );
  }

  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  const existing = await findPrimeReport(
    user.id,
    profile.birthProfileId,
    reportType,
    LIFETIME_PERIOD,
  );

  if (!existing) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'This report is not unlocked yet.' } },
      403,
    );
  }

  if (existing.status !== 'ready' || !existing.analysis) {
    return c.json(
      {
        error: {
          code: 'CONFLICT',
          message:
            'This report is still generating or failed — check GET /v1/prime/reports/flagship-life-report first.',
        },
      },
      409,
    );
  }

  if (!profile.displayName || !profile.dateOfBirth) {
    throw new Error('Flagship report exists but the active profile is missing name/date of birth');
  }

  const pdfBuffer = await renderFlagshipReportPdf(
    existing.analysis as unknown as FlagshipReportContent,
    {
      fullName: profile.displayName,
      dateOfBirth: profile.dateOfBirth,
      gender: profile.gender,
    },
  );

  // `Buffer`'s `ArrayBufferLike` backing type isn't assignable to Hono's
  // `Uint8Array<ArrayBuffer>` body type (it could theoretically be backed by
  // a SharedArrayBuffer) — copy into a plain Uint8Array to satisfy that.
  return c.body(new Uint8Array(pdfBuffer), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="aroha-prime-life-report.pdf"',
  });
});
