import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { FeedbackBodySchema, FeedbackResponseSchema } from './feedback.schemas.js';
import { recordFeedback, FEEDBACK_REWARD_FALLBACK_PAISE } from './feedback.repo.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { payoutOf } from '../features/features.service.js';
import { formatPaise } from '../../lib/money.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('FeedbackError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const feedbackRouter = new OpenAPIHono();

feedbackRouter.use('*', requireUser);

/* -------------------------------------------------------------------------- */
/* POST /feedback                                                              */
/* -------------------------------------------------------------------------- */

const submitFeedbackRoute = createRoute({
  method: 'post',
  path: '/feedback',
  tags: ['Feedback'],
  summary: 'Submit user feedback or a prediction rating',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: FeedbackBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Feedback recorded',
      content: { 'application/json': { schema: FeedbackResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Validation failed'),
  },
});

/** How long after a rating the thank-you push lands. Deliberately not instant:
 * the reward is never promised in the UI, so it should read as a surprise a
 * moment later rather than as payment for the rating. */
const THANK_YOU_DELAY_MS = 60_000;

feedbackRouter.openapi(submitFeedbackRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  // Admin-set thank-you amount — the same resolved value is credited AND quoted
  // in the push below, so the message can never name a figure that differs from
  // what actually landed in the wallet.
  const rewardPaise = await payoutOf(
    user.id,
    'referral.feedbackReward',
    FEEDBACK_REWARD_FALLBACK_PAISE,
  );

  const { id, rewarded } = await recordFeedback({
    userId: user.id,
    rating: body.rating,
    rewardPaise,
    ...(body.comment ? { comment: body.comment } : {}),
  });

  if (rewarded) {
    // ponytail: in-process timer, so a restart inside the next minute drops the
    // push — the credit is already committed to the ledger either way, and the
    // user still sees it in Payment History. Move to the cron module if this
    // ever needs to survive a deploy.
    setTimeout(() => {
      // English, matching every other transactional push here (report ready,
      // referral bonus) — there is no localized copy path for these yet.
      void notifyUser(user.id, {
        title: '🙏 Thanks for your review',
        body: `We've added ${formatPaise(rewardPaise)} to your wallet — use it on any reading.`,
        type: 'feedback_reward',
        link: '/settings/history',
      });
    }, THANK_YOU_DELAY_MS).unref();
  }

  // `rewarded` is deliberately not returned: the reward is never advertised in
  // the UI, it arrives as the push above and as a line in Payment History.
  return c.json({ id, received: true }, 201);
});
