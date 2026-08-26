/**
 * One-off admin-triggered broadcast: "Share & Earn" push promoting the
 * referral program at its currently-live amounts. Not a reusable campaign
 * system like gift-campaigns — just a button for a one-time push, reusing
 * every existing primitive (resolveAudience, payoutOf, notifyUser) rather
 * than building a new send pipeline for it.
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import pLimit from 'p-limit';
import { requireAdmin } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import { formatPaise } from '../../lib/money.js';
import { payoutOf } from '../features/features.service.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { resolveAudience } from '../gift-campaigns/gift-campaigns.repo.js';
import { getAllActiveTokens } from '../device-tokens/device-tokens.repo.js';
import { normalizeLang, type LangCode } from '../cron/broadcast-copy.js';
import { logAdminAction } from './admin.repo.js';

const REFERRER_BONUS_FALLBACK_PAISE = 10000;
const REFEREE_BONUS_FALLBACK_PAISE = 5000;
/** Matches the horoscope/gift-campaign batch jobs' concurrency — plenty at this app's user counts. */
const SEND_CONCURRENCY = 10;

type CopyFn = (referrerBonus: string, refereeBonus: string) => { title: string; body: string };

const REFERRAL_PROMO_COPY: Record<LangCode, CopyFn> = {
  en: (referrerBonus, refereeBonus) => ({
    title: `Share the Blessings, Earn ${referrerBonus} 🎁`,
    body: `Invite a friend to Aroha Astrology — you get ${referrerBonus}, they get ${refereeBonus}. Tap to share your code.`,
  }),
  hi: (referrerBonus, refereeBonus) => ({
    title: `आशीर्वाद बांटें, ${referrerBonus} कमाएं 🎁`,
    body: `किसी दोस्त को Aroha Astrology पर आमंत्रित करें — आपको ${referrerBonus} और उन्हें ${refereeBonus} मिलेंगे। कोड शेयर करने के लिए टैप करें।`,
  }),
  bn: (referrerBonus, refereeBonus) => ({
    title: `আশীর্বাদ ভাগ করুন, ${referrerBonus} উপার্জন করুন 🎁`,
    body: `একজন বন্ধুকে Aroha Astrology-তে আমন্ত্রণ জানান — আপনি ${referrerBonus} এবং তারা ${refereeBonus} পাবেন। কোড শেয়ার করতে ট্যাপ করুন।`,
  }),
  mr: (referrerBonus, refereeBonus) => ({
    title: `आशीर्वाद वाटा, ${referrerBonus} कमवा 🎁`,
    body: `एका मित्राला Aroha Astrology वर आमंत्रित करा — तुम्हाला ${referrerBonus} आणि त्यांना ${refereeBonus} मिळतील. कोड शेअर करण्यासाठी टॅप करा.`,
  }),
  te: (referrerBonus, refereeBonus) => ({
    title: `ఆశీర్వాదాలు పంచుకోండి, ${referrerBonus} సంపాదించండి 🎁`,
    body: `ఒక స్నేహితుడిని Aroha Astrology కి ఆహ్వానించండి — మీకు ${referrerBonus} మరియు వారికి ${refereeBonus} లభిస్తుంది. కోడ్ షేర్ చేయడానికి నొక్కండి.`,
  }),
  ta: (referrerBonus, refereeBonus) => ({
    title: `ஆசீர்வாதங்களைப் பகிர்ந்து ${referrerBonus} சம்பாதியுங்கள் 🎁`,
    body: `ஒரு நண்பரை Aroha Astrology-க்கு அழையுங்கள் — உங்களுக்கு ${referrerBonus} மற்றும் அவர்களுக்கு ${refereeBonus} கிடைக்கும். குறியீட்டைப் பகிர தட்டவும்.`,
  }),
  gu: (referrerBonus, refereeBonus) => ({
    title: `આશીર્વાદ વહેંચો, ${referrerBonus} કમાઓ 🎁`,
    body: `કોઈ મિત્રને Aroha Astrology પર આમંત્રિત કરો — તમને ${referrerBonus} અને તેમને ${refereeBonus} મળશે. કોડ શેર કરવા ટેપ કરો.`,
  }),
};

export const adminBroadcastRouter = new OpenAPIHono();

function adminPhoneOf(c: { get: (key: 'firebaseToken') => { phone_number?: string } }): string {
  return c.get('firebaseToken').phone_number ?? 'unknown';
}

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('AdminBroadcastError');

/* -------------------------------------------------------------------------- */
/* GET /admin/broadcast/referral-promo/preview                                */
/* -------------------------------------------------------------------------- */

const previewRoute = createRoute({
  method: 'get',
  path: '/admin/broadcast/referral-promo/preview',
  tags: ['Admin'],
  summary: 'Eligible/pushable count for the referral-promo broadcast, split by platform',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'Audience size',
      content: {
        'application/json': {
          schema: z.object({
            eligibleCount: z.number(),
            pushableCount: z.number(),
            iosCount: z.number(),
            androidCount: z.number(),
            webCount: z.number(),
          }),
        },
      },
    },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
    403: {
      description: 'Admin access required',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

adminBroadcastRouter.openapi(previewRoute, async (c) => {
  const [audience, tokens] = await Promise.all([resolveAudience(null), getAllActiveTokens()]);

  // A user can hold more than one active token (a phone + a tablet, or a
  // reinstall that never revoked the old one) — count distinct USERS per
  // platform, same dedup previewAudience already does for the combined total,
  // so "how many people get this on iOS" isn't inflated by extra devices.
  const usersByPlatform: Record<'ios' | 'android' | 'web', Set<string>> = {
    ios: new Set(),
    android: new Set(),
    web: new Set(),
  };
  const allPushableUsers = new Set<string>();
  for (const t of tokens) {
    usersByPlatform[t.platform].add(t.userId);
    allPushableUsers.add(t.userId);
  }

  return c.json(
    {
      eligibleCount: audience.length,
      pushableCount: allPushableUsers.size,
      iosCount: usersByPlatform.ios.size,
      androidCount: usersByPlatform.android.size,
      webCount: usersByPlatform.web.size,
    },
    200,
  );
});

/* -------------------------------------------------------------------------- */
/* POST /admin/broadcast/referral-promo                                       */
/* -------------------------------------------------------------------------- */

const sendRoute = createRoute({
  method: 'post',
  path: '/admin/broadcast/referral-promo',
  tags: ['Admin'],
  summary: 'Send the "Share & Earn" referral-promo push to every active user, in their language',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'Send result',
      content: { 'application/json': { schema: z.object({ attempted: z.number() }) } },
    },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
    403: {
      description: 'Admin access required',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

adminBroadcastRouter.openapi(sendRoute, async (c) => {
  const audience = await resolveAudience(null);
  const limit = pLimit(SEND_CONCURRENCY);

  const results = await Promise.allSettled(
    audience.map((member) =>
      limit(async () => {
        const [referrerPaise, refereePaise] = await Promise.all([
          payoutOf(member.userId, 'referral.referrerBonus', REFERRER_BONUS_FALLBACK_PAISE),
          payoutOf(member.userId, 'referral.refereeBonus', REFEREE_BONUS_FALLBACK_PAISE),
        ]);
        const lang = normalizeLang(member.locale);
        const copyFn = REFERRAL_PROMO_COPY[lang] ?? REFERRAL_PROMO_COPY.en;
        const copy = copyFn(formatPaise(referrerPaise), formatPaise(refereePaise));
        await notifyUser(member.userId, {
          title: copy.title,
          body: copy.body,
          type: 'referral_promo',
          link: '/profile',
        });
      }),
    ),
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    logger.error(
      { failed, total: audience.length },
      'admin-broadcast: some recipients failed during referral-promo send',
    );
  }
  await logAdminAction(adminPhoneOf(c), 'POST /v1/admin/broadcast/referral-promo', {
    attempted: audience.length,
    failed,
  });
  return c.json({ attempted: audience.length }, 200);
});
