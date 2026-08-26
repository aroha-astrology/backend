import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import { resolveFeaturesForUser } from '../features/features.service.js';
import { hasGivenFeedback } from '../feedback/feedback.repo.js';
import {
  ensureReferralCode,
  collectUserExport,
  getClaimedCampaignKeys,
  claimCampaignBonus,
  recordActivityHeartbeat,
} from './users.repo.js';
import { CLAIM_CAMPAIGN_KEYS } from '../../config/campaigns.js';
import { resolveClaimCampaign } from '../gift-campaigns/gift-campaigns.service.js';
import { istDateString } from '../../lib/astro-tools/transit-events.js';
import { getClientIp } from '../../lib/client-ip.js';
import { Errors } from '../../lib/errors.js';
import { UpdateMeBodySchema, UserSchema, NotificationSchema } from './users.schemas.js';
import {
  requestAccountDeletion,
  toUserDto,
  updateMe,
  unlockHouse,
  unlockGemstone,
  getNotifications,
  markNotificationsRead,
  resolveActiveClaimableCampaign,
} from './users.service.js';

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

export const usersRouter = new OpenAPIHono();

const getMeRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Users'],
  summary: 'Get current user profile',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'The current user',
      content: { 'application/json': { schema: UserSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

const patchMeRoute = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['Users'],
  summary: 'Update current user profile',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: UpdateMeBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'The updated user',
      content: { 'application/json': { schema: UserSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Validation failed'),
  },
});

/** Matches the frontend's ActivityHeartbeatProvider ping interval — the server, not the client,
 * is the source of truth for how many seconds a ping is worth, so a compromised/scripted client
 * can't inflate its own time-spent by sending a larger claimed duration. */
const HEARTBEAT_INTERVAL_SECONDS = 60;

const activityHeartbeatRoute = createRoute({
  method: 'post',
  path: '/me/activity-heartbeat',
  tags: ['Users'],
  summary: 'Record one interval of active app usage, for admin time-spent reporting',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Success',
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

const unlockHouseRoute = createRoute({
  method: 'post',
  path: '/me/unlock-house',
  tags: ['Users'],
  summary: 'Unlock a house using wallet balance',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': { schema: z.object({ houseNumber: z.number().int().min(1).max(12) }) },
      },
    },
  },
  responses: {
    200: {
      description: 'Success',
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
    },
    401: errorResponse('Unauthorized'),
    409: errorResponse('Conflict (Insufficient balance or already unlocked)'),
    422: errorResponse('Validation failed'),
  },
});

const unlockGemstoneRoute = createRoute({
  method: 'post',
  path: '/me/unlock-gemstone',
  tags: ['Users'],
  summary: 'Unlock the full gemstone report using wallet balance (one-time, whole report)',
  description:
    'Optional body { weightKg } captures the body weight used to compute a recommended ' +
    'gemstone carat weight (see GET /v1/gemstone). Not required — an unlock without it ' +
    'simply leaves the recommendation unavailable until re-supplied on a future unlock ' +
    "attempt of a DIFFERENT profile (this profile's unlock is one-time, so it can only be " +
    'set here, at unlock time).',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({ weightKg: z.number().min(20).max(300).optional() }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Success',
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
    },
    401: errorResponse('Unauthorized'),
    409: errorResponse('Conflict (Insufficient balance or already unlocked)'),
  },
});

const claimCampaignBonusRoute = createRoute({
  method: 'post',
  path: '/me/claim-bonus/{campaignKey}',
  tags: ['Users'],
  summary: 'Claim a one-time wallet bonus campaign (see config/campaigns.ts)',
  description:
    'Generic across every claim campaign — Independence Day 2026 today, whatever comes next — ' +
    'so a new campaign only ever needs a new CLAIM_CAMPAIGNS entry, never a new route.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    params: z.object({ campaignKey: z.string() }),
  },
  responses: {
    200: {
      description: 'Claim result — `claimed: false` means this user already claimed it before',
      content: {
        'application/json': {
          schema: z.object({ claimed: z.boolean(), walletBalancePaise: z.number().int() }),
        },
      },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Unknown campaign key'),
    409: errorResponse('Conflict (claim window closed, or the offer is currently disabled)'),
  },
});

const deleteMeRoute = createRoute({
  method: 'delete',
  path: '/me',
  tags: ['Users'],
  summary: 'Request deletion of the current user account',
  description:
    'Files a deletion request for admin review — it does NOT erase anything. ' +
    'The request is announced to the admin Telegram chat and re-announced daily ' +
    'from day 6 until someone runs /approvedelete (which performs the actual, ' +
    'irreversible anonymisation) or /rejectdelete. The account keeps working ' +
    'while pending, but push notifications and horoscope generation are ' +
    'suppressed for it. Idempotent: a repeat call keeps the original timestamp.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    204: { description: 'Deletion request recorded' },
    401: errorResponse('Unauthorized'),
  },
});

const exportMeRoute = createRoute({
  method: 'get',
  path: '/me/export',
  tags: ['Users'],
  summary: 'Export everything the account holds on the caller (DPDP §11 / GDPR Art. 15 & 20)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Machine-readable export of the caller’s own data',
      content: {
        'application/json': {
          // Per-section `z.any()` rather than a full restatement of every
          // column in eight tables — same pattern astro.routes.ts uses for
          // its forecast/panchang payloads. The export is a snapshot, not a
          // contract to keep in sync with every future migration.
          schema: z.object({
            exportedAt: z.string(),
            account: z.any(),
            birthProfiles: z.any(),
            chatSessions: z.any(),
            rememberedFacts: z.any(),
            walletTransactions: z.any(),
            consentHistory: z.any(),
            notifications: z.any(),
            palmReadings: z.any(),
          }),
        },
      },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('User not found'),
  },
});

const getNotificationsRoute = createRoute({
  method: 'get',
  path: '/me/notifications',
  tags: ['Users'],
  summary: 'Get user notifications',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'List of notifications',
      content: { 'application/json': { schema: z.array(NotificationSchema) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

const markNotificationsReadRoute = createRoute({
  method: 'patch',
  path: '/me/notifications/read',
  tags: ['Users'],
  summary: 'Mark all user notifications as read',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Success',
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

usersRouter.openapi(getMeRoute, async (c) => {
  const user = await ensureReferralCode(c.get('user'));
  const profile = await resolveActiveProfileContext(user);
  const features = await resolveFeaturesForUser(user.id);
  const feedbackGiven = await hasGivenFeedback(user.id);
  const claimedCampaigns = await getClaimedCampaignKeys(user.id, CLAIM_CAMPAIGN_KEYS);
  const activeClaimableCampaign = await resolveActiveClaimableCampaign(user, claimedCampaigns);
  return c.json(
    toUserDto(user, profile, features, feedbackGiven, claimedCampaigns, activeClaimableCampaign),
    200,
  );
});

usersRouter.openapi(patchMeRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const sourceIp =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? null;
  const userAgent = c.req.header('user-agent') ?? null;
  const next = await updateMe(user.id, body, { sourceIp, userAgent });
  const profile = await resolveActiveProfileContext(next);
  const features = await resolveFeaturesForUser(next.id);
  const feedbackGiven = await hasGivenFeedback(next.id);
  const claimedCampaigns = await getClaimedCampaignKeys(next.id, CLAIM_CAMPAIGN_KEYS);
  const activeClaimableCampaign = await resolveActiveClaimableCampaign(next, claimedCampaigns);
  return c.json(
    toUserDto(next, profile, features, feedbackGiven, claimedCampaigns, activeClaimableCampaign),
    200,
  );
});

usersRouter.openapi(deleteMeRoute, async (c) => {
  const user = c.get('user');
  await requestAccountDeletion(user.id);
  return c.body(null, 204);
});

// Scoped to `user.id` from the bearer token — there is deliberately no
// user-id parameter to tamper with, so this can only ever return the
// caller's own data.
usersRouter.openapi(exportMeRoute, async (c) => {
  const user = c.get('user');
  const data = await collectUserExport(user.id);
  if (!data) throw Errors.notFound('User not found');
  c.header('Content-Disposition', 'attachment; filename="aroha-my-data.json"');
  return c.json(data, 200);
});

usersRouter.openapi(activityHeartbeatRoute, async (c) => {
  const user = c.get('user');
  const ip = getClientIp(c);
  await recordActivityHeartbeat(user.id, ip, HEARTBEAT_INTERVAL_SECONDS);
  return c.json({ success: true }, 200);
});

usersRouter.openapi(unlockHouseRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const profile = await resolveActiveProfileContext(user);
  await unlockHouse(user.id, profile.birthProfileId, body.houseNumber);
  return c.json({ success: true }, 200);
});

usersRouter.openapi(unlockGemstoneRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const profile = await resolveActiveProfileContext(user);
  await unlockGemstone(user.id, profile.birthProfileId, body.weightKg ?? null);
  return c.json({ success: true }, 200);
});

usersRouter.openapi(claimCampaignBonusRoute, async (c) => {
  const user = c.get('user');
  const { campaignKey } = c.req.valid('param');

  const campaign = await resolveClaimCampaign(campaignKey, user.id);
  if (!campaign) throw Errors.notFound('Unknown campaign');
  if (!campaign.isOpenNow) {
    throw Errors.conflict('This claim window has closed.');
  }
  // A brand-new account already receives the standard signup wallet balance (see the
  // `wallet_balance_paise` column default) — someone who signed up today would otherwise
  // stack that with the campaign bonus. Applies to every campaign, not just this one.
  if (istDateString(user.createdAt) === campaign.eligibleIstDate) {
    throw Errors.conflict(
      'New signups already receive a starting balance and are not eligible for this claim.',
    );
  }
  // Balance-gated campaigns (a "running low" top-up) re-check the wallet here
  // rather than trusting the audience the announcement was sent to — someone
  // who recharged in between is no longer who the offer is for.
  if (
    campaign.maxBalancePaise !== undefined &&
    user.walletBalancePaise >= campaign.maxBalancePaise
  ) {
    throw Errors.conflict('This offer is only for wallets running low.');
  }
  if (campaign.amountPaise <= 0) {
    throw Errors.conflict('This offer is not currently available.');
  }
  const result = await claimCampaignBonus(
    user.id,
    campaign.key,
    campaign.amountPaise,
    campaign.expiresAt,
  );
  return c.json(result, 200);
});

usersRouter.openapi(getNotificationsRoute, async (c) => {
  const user = c.get('user');
  const notifications = await getNotifications(user.id);
  return c.json(notifications, 200);
});

usersRouter.openapi(markNotificationsReadRoute, async (c) => {
  const user = c.get('user');
  await markNotificationsRead(user.id);
  return c.json({ success: true }, 200);
});
