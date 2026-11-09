/**
 * Admin-only "Varshik Rashifal 2027 launch" push, in three steps so nothing goes out by accident:
 *   GET  /admin/broadcast/varshik-launch/preview  who would get it (counts, by language) and the English text
 *   POST /admin/broadcast/varshik-launch/test     the same notification to the calling admin only
 *   POST /admin/broadcast/varshik-launch/send     body { confirmRecipients } must equal the preview's eligibleCount
 * Each user gets it once (a second send reaches only users the first missed). Sending is logged in the audit log.
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
import { Errors } from '../../lib/errors.js';
import { logAdminAction } from './admin.repo.js';
import { findUserByFirebaseUid } from '../users/users.repo.js';
import {
  previewVarshikLaunch,
  sendVarshikLaunch,
  sendVarshikLaunchTest,
} from './varshik-launch-push.service.js';

export const adminVarshikLaunchRouter = new OpenAPIHono();

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('AdminVarshikLaunchError');

const errors = {
  401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  403: { description: 'Admin access required', content: { 'application/json': { schema: ErrorSchema } } },
};

function adminPhoneOf(c: { get: (key: 'firebaseToken') => { phone_number?: string } }): string {
  return c.get('firebaseToken').phone_number ?? 'unknown';
}

const CopySchema = z.object({ title: z.string(), body: z.string() });

const previewRoute = createRoute({
  method: 'get',
  path: '/admin/broadcast/varshik-launch/preview',
  tags: ['Admin'],
  summary: 'Who the Varshik launch push would reach, by language, and the English text',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'Counts',
      content: {
        'application/json': {
          schema: z.object({
            eligibleCount: z.number(),
            pushableCount: z.number(),
            alreadySentCount: z.number(),
            byLanguage: z.record(z.string(), z.number()),
            copyEnglish: CopySchema,
          }),
        },
      },
    },
    ...errors,
  },
});

adminVarshikLaunchRouter.openapi(previewRoute, async (c) => c.json(await previewVarshikLaunch(), 200));

const testRoute = createRoute({
  method: 'post',
  path: '/admin/broadcast/varshik-launch/test',
  tags: ['Admin'],
  summary: 'Send the Varshik launch push to the calling admin only, in their language',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'Sent',
      content: { 'application/json': { schema: z.object({ sentTo: z.literal('you'), copy: CopySchema }) } },
    },
    ...errors,
  },
});

adminVarshikLaunchRouter.openapi(testRoute, async (c) => {
  const user = await findUserByFirebaseUid(c.get('firebaseToken').uid);
  if (!user) throw Errors.notFound('No user account for this admin');
  const copy = await sendVarshikLaunchTest({ id: user.id, locale: user.locale });
  await logAdminAction(adminPhoneOf(c), 'POST /v1/admin/broadcast/varshik-launch/test', { userId: user.id });
  return c.json({ sentTo: 'you' as const, copy }, 200);
});

let sending = false;

const sendRoute = createRoute({
  method: 'post',
  path: '/admin/broadcast/varshik-launch/send',
  tags: ['Admin'],
  summary: 'Send the Varshik launch push to every user who has not had it (needs the preview count to confirm)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ confirmRecipients: z.number().int().min(0) }) } },
    },
  },
  responses: {
    200: {
      description: 'Send result',
      content: { 'application/json': { schema: z.object({ attempted: z.number(), failed: z.number() }) } },
    },
    409: { description: 'Count changed or a send is running', content: { 'application/json': { schema: ErrorSchema } } },
    ...errors,
  },
});

adminVarshikLaunchRouter.openapi(sendRoute, async (c) => {
  const { confirmRecipients } = c.req.valid('json');
  if (sending) throw Errors.conflict('A launch send is already running');
  sending = true;
  try {
    const preview = await previewVarshikLaunch();
    if (preview.eligibleCount !== confirmRecipients) {
      throw Errors.conflict(
        `The recipient count is now ${preview.eligibleCount}, not ${confirmRecipients}. Look at the preview again.`,
      );
    }
    const result = await sendVarshikLaunch();
    await logAdminAction(adminPhoneOf(c), 'POST /v1/admin/broadcast/varshik-launch/send', result);
    return c.json(result, 200);
  } finally {
    sending = false;
  }
});
