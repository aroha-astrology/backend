import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin, requireUser } from '../../middleware/auth.js';
import { requireAnyFeature } from '../../middleware/feature.js';
import { resolveDateRangePreset } from '../admin/admin.repo.js';
import { DateRangeQuerySchema } from '../admin/admin.schemas.js';
import {
  SHARE_CHANNELS,
  STORY_EVENT_KINDS,
  STORY_IDS,
  storyStats,
  trackStoryEvent,
} from './stories.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('StoriesError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const storiesRouter = new OpenAPIHono();

/* -------------------------------------------------------------------------- */
/* POST /stories/events — a story was opened, or a share option was tapped     */
/* -------------------------------------------------------------------------- */

const StoryEventSchema = z
  .object({
    kind: z.enum(STORY_EVENT_KINDS),
    storyId: z.enum(STORY_IDS),
    channel: z.enum(SHARE_CHANNELS).optional().openapi({ description: 'Required for kind=share' }),
  })
  .openapi('StoryEvent');

const trackRoute = createRoute({
  method: 'post',
  path: '/stories/events',
  tags: ['Stories'],
  summary: 'Count a Daily Story being opened (once per story per day) or shared',
  security: [{ bearerAuth: [] }],
  // requireAnyFeature, not requireFeature: a ship-dark key missing from the map must count as off.
  middleware: [requireUser, requireAnyFeature(['home.dailyStories'])] as const,
  request: {
    body: { required: true, content: { 'application/json': { schema: StoryEventSchema } } },
  },
  responses: {
    200: {
      description: 'Counted',
      content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
    },
    400: errorResponse('SHARE_CHANNEL_REQUIRED, or an unknown story or channel'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

storiesRouter.openapi(trackRoute, async (c) => {
  await trackStoryEvent(c.get('user').id, c.req.valid('json'));
  return c.json({ ok: true }, 200);
});

/* -------------------------------------------------------------------------- */
/* Admin: who opened the stories, who shared them and where                    */
/* -------------------------------------------------------------------------- */

const StoryStatsSchema = z
  .object({
    visitors: z.number(),
    views: z.number(),
    sharers: z.number(),
    shares: z.number(),
    shareChannels: z.record(z.string(), z.number()),
    stories: z.array(
      z.object({
        storyId: z.string(),
        viewers: z.number(),
        shares: z.number(),
        shareChannels: z.record(z.string(), z.number()),
      }),
    ),
  })
  .openapi('AdminStoryStats');

const adminStatsRoute = createRoute({
  method: 'get',
  path: '/admin/story-stats',
  tags: ['Admin'],
  summary: 'Daily Stories: visitors, views per story and share taps by channel, for a date range',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { query: DateRangeQuerySchema },
  responses: {
    200: {
      description: 'Story numbers',
      content: { 'application/json': { schema: StoryStatsSchema } },
    },
    400: errorResponse('Unknown preset or malformed custom from/to'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
  },
});

storiesRouter.openapi(adminStatsRoute, async (c) => {
  const { preset, from, to } = c.req.valid('query');
  const stats = await storyStats(resolveDateRangePreset(preset, from, to));
  return c.json(stats, 200);
});
