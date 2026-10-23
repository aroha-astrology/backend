// =============================================================================
// Aroha Pass go-live: the readiness check and the one launch notification
// =============================================================================
// Admin → Aroha Pass shows what `passLaunchReadiness()` returns: every switch
// the Pass needs, and whether it is on for everyone. The launch notification
// ("Aroha Pass is here") goes to every user once, in their language, and opens
// /pass. It is refused while the Pass is not ready, and a second send only
// reaches the users the first one missed.
// =============================================================================

import pLimit from 'p-limit';
import { FEATURE_REGISTRY } from '../../config/features.js';
import { isGooglePlayConfigured } from '../../config/google-play.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { normalizeLang, type LangCode } from '../cron/broadcast-copy.js';
import { getAllActiveTokens } from '../device-tokens/device-tokens.repo.js';
import { resolveFeatures } from '../features/features.service.js';
import { resolveAudience } from '../gift-campaigns/gift-campaigns.repo.js';
import { PASS_TIERS, type PassFeature } from './pass.config.js';
import { listUserIdsNotified } from './pass.repo.js';

export const PASS_LAUNCH_TYPE = 'pass_launch';
/** A try-out sent to the admin alone: it must not count as that admin's launch notification. */
export const PASS_LAUNCH_TEST_TYPE = 'pass_launch_test';
const PASS_SWITCH = 'nav.arohaPass';
const POPUP_SWITCH = 'home.passLaunchPopup';
/** Matches the other admin broadcasts. */
const SEND_CONCURRENCY = 10;

/** The switch that shows each Pass-only feature. A member cannot reach a feature whose switch is off. */
const FEATURE_SWITCH: Record<PassFeature, string> = {
  voiceCall: 'paid.voiceChat',
  timeline: 'nav.lifeTimeline',
  bonds: 'nav.bonds',
  decisions: 'nav.decisions',
  findMyDate: 'panchang.findMyDate',
  birthTime: 'home.birthTimeConfidence',
  relocation: 'nav.relocation',
  palm: 'home.palmReading',
};

const LAUNCH_COPY: Record<LangCode, { title: string; body: string }> = {
  en: {
    title: 'Aroha Pass is here 👑',
    body: 'More questions, live calls with Yogi Baba, your Life Timeline and money off every report. Tap to see all the benefits.',
  },
  hi: {
    title: 'Aroha Pass आ गया है 👑',
    body: 'ज़्यादा सवाल, योगी बाबा से लाइव कॉल, आपकी जीवन टाइमलाइन और हर रिपोर्ट पर छूट। सभी फ़ायदे देखने के लिए टैप करें।',
  },
  bn: {
    title: 'Aroha Pass এসে গেছে 👑',
    body: 'আরও প্রশ্ন, যোগী বাবার সঙ্গে লাইভ কল, আপনার জীবন টাইমলাইন এবং প্রতিটি রিপোর্টে ছাড়। সব সুবিধা দেখতে ট্যাপ করুন।',
  },
  mr: {
    title: 'Aroha Pass आला आहे 👑',
    body: 'अधिक प्रश्न, योगी बाबांशी लाइव्ह कॉल, तुमची जीवन टाइमलाइन आणि प्रत्येक रिपोर्टवर सूट. सर्व फायदे पाहण्यासाठी टॅप करा.',
  },
  te: {
    title: 'Aroha Pass వచ్చేసింది 👑',
    body: 'మరిన్ని ప్రశ్నలు, యోగి బాబాతో లైవ్ కాల్, మీ జీవిత టైమ్‌లైన్ మరియు ప్రతి రిపోర్ట్‌పై తగ్గింపు. అన్ని ప్రయోజనాలు చూడటానికి నొక్కండి.',
  },
  ta: {
    title: 'Aroha Pass வந்துவிட்டது 👑',
    body: 'அதிக கேள்விகள், யோகி பாபாவுடன் நேரடி அழைப்பு, உங்கள் வாழ்க்கை டைம்லைன் மற்றும் ஒவ்வொரு அறிக்கையிலும் தள்ளுபடி. எல்லா நன்மைகளையும் பார்க்க தட்டவும்.',
  },
  gu: {
    title: 'Aroha Pass આવી ગયો છે 👑',
    body: 'વધુ પ્રશ્નો, યોગી બાબા સાથે લાઇવ કૉલ, તમારી જીવન ટાઇમલાઇન અને દરેક રિપોર્ટ પર છૂટ. બધા ફાયદા જોવા ટેપ કરો.',
  },
};

export function passLaunchCopy(locale: string | null | undefined): { title: string; body: string } {
  return LAUNCH_COPY[normalizeLang(locale)];
}

export interface LaunchSwitch {
  key: string;
  label: string;
  /** On for everyone (an admin user group can still differ). */
  enabled: boolean;
  /** 'required' holds back "ready"; 'optional' is the owner's choice. */
  need: 'required' | 'optional';
}

export interface PassLaunchReadiness {
  /** The Pass can be sold and every feature a tier on sale promises can be reached. */
  ready: boolean;
  switches: LaunchSwitch[];
  /** The server can check purchases with Google Play. */
  playConfigured: boolean;
  audience: { users: number; withPush: number; alreadySent: number };
}

const labelOf = (key: string) => FEATURE_REGISTRY.find((f) => f.key === key)?.label ?? key;

export async function passLaunchReadiness(): Promise<PassLaunchReadiness> {
  const [features, audience, tokens, sent] = await Promise.all([
    resolveFeatures(),
    resolveAudience(null),
    getAllActiveTokens(),
    listUserIdsNotified(PASS_LAUNCH_TYPE),
  ]);
  const on = (key: string) => features[key]?.enabled === true;
  const row = (key: string, need: LaunchSwitch['need']): LaunchSwitch => ({
    key,
    label: labelOf(key),
    enabled: on(key),
    need,
  });

  const tiersOn = PASS_TIERS.filter((t) => on(t.key));
  // A feature is promised as soon as one tier on sale lists it; before any tier is on, all of them.
  const promised = new Set<PassFeature>(
    (tiersOn.length > 0 ? tiersOn : PASS_TIERS).flatMap((t) => [...t.features]),
  );

  const switches: LaunchSwitch[] = [
    row(PASS_SWITCH, 'required'),
    // One tier is enough to sell the Pass; the owner chooses which.
    ...PASS_TIERS.map((t) => row(t.key, tiersOn.length === 0 ? 'required' : 'optional')),
    ...(Object.keys(FEATURE_SWITCH) as PassFeature[]).map((f) =>
      row(FEATURE_SWITCH[f], promised.has(f) ? 'required' : 'optional'),
    ),
    row('home.bondsCard', 'optional'),
    row(POPUP_SWITCH, 'optional'),
  ];

  const playConfigured = isGooglePlayConfigured();
  const pushable = new Set(tokens.map((t) => t.userId));
  return {
    ready: playConfigured && switches.every((s) => s.need === 'optional' || s.enabled),
    switches,
    playConfigured,
    audience: {
      users: audience.length,
      withPush: audience.filter((a) => pushable.has(a.userId)).length,
      alreadySent: audience.filter((a) => sent.has(a.userId)).length,
    },
  };
}

export interface PassLaunchSend {
  attempted: number;
  failed: number;
  /** Users left out because an earlier send already reached them. */
  skipped: number;
}

/**
 * Sends the launch notification to every user who has not had it. With
 * `onlyUser`, sends a try-out to that one user instead (any number of times),
 * which works before the Pass is ready so the owner can see it first.
 */
export async function sendPassLaunch(
  opts: { onlyUser?: { id: string; locale: string | null } } = {},
): Promise<PassLaunchSend> {
  if (opts.onlyUser) {
    await notifyUser(opts.onlyUser.id, {
      ...passLaunchCopy(opts.onlyUser.locale),
      type: PASS_LAUNCH_TEST_TYPE,
      link: '/pass',
    });
    return { attempted: 1, failed: 0, skipped: 0 };
  }

  const readiness = await passLaunchReadiness();
  if (!readiness.ready) throw Errors.conflict('PASS_NOT_READY');

  const [audience, sent] = await Promise.all([
    resolveAudience(null),
    listUserIdsNotified(PASS_LAUNCH_TYPE),
  ]);
  const due = audience.filter((a) => !sent.has(a.userId));
  const limit = pLimit(SEND_CONCURRENCY);
  const results = await Promise.allSettled(
    due.map((member) =>
      limit(() =>
        notifyUser(member.userId, {
          ...passLaunchCopy(member.locale),
          type: PASS_LAUNCH_TYPE,
          link: '/pass',
        }),
      ),
    ),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) logger.error({ failed, total: due.length }, 'pass-launch: some sends failed');
  return { attempted: due.length, failed, skipped: audience.length - due.length };
}
