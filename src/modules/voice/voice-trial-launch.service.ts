// =============================================================================
// Voice trial launch (Durga Puja 2026): the one notification to every user
// =============================================================================
// Every user gets VOICE_TRIAL_MINUTES of voice call free once (see
// voice.service.ts). This tells them, once each, in their language, and opens
// the chat with the call button. A second send only reaches the users the first
// one missed (new sign-ups, a failed send). It is filed under Offers, so users
// who turned Offers off, or are in quiet hours, get it in the bell only.
//
// Sent from the server with scripts/send-voice-trial-push.ts. The wording never
// mentions AI (owner's rule for anything promotional): it is Yogi Baba.
// =============================================================================

import pLimit from 'p-limit';
import { logger } from '../../lib/logger.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { normalizeLang, type LangCode } from '../cron/broadcast-copy.js';
import { resolveAudience } from '../gift-campaigns/gift-campaigns.repo.js';
import { listUserIdsNotified } from '../pass/pass.repo.js';

export const VOICE_TRIAL_LAUNCH_TYPE = 'voice_trial_launch';
/** A try-out sent to the admin alone: it must not count as that admin's launch notification. */
export const VOICE_TRIAL_LAUNCH_TEST_TYPE = 'voice_trial_launch_test';
/** The chat, with the call button pointed out (frontend ChatConversation reads `call=1`). */
export const VOICE_TRIAL_LAUNCH_LINK = '/ai-chat?call=1';
/** Matches the other admin broadcasts. */
const SEND_CONCURRENCY = 10;

const LAUNCH_COPY: Record<LangCode, { title: string; body: string }> = {
  en: {
    title: 'Durga Puja gift: talk to Yogi Baba 🪔',
    body: 'This Durga Puja, call Yogi Baba and talk for 3 minutes free. Tap to start your call.',
  },
  hi: {
    title: 'दुर्गा पूजा का उपहार: योगी बाबा से बात करें 🪔',
    body: 'इस दुर्गा पूजा पर योगी बाबा को कॉल करें और 3 मिनट मुफ़्त बात करें। कॉल शुरू करने के लिए टैप करें।',
  },
  bn: {
    title: 'দুর্গাপুজোর উপহার: যোগী বাবার সঙ্গে কথা বলুন 🪔',
    body: 'এই দুর্গাপুজোয় যোগী বাবাকে কল করুন, ৩ মিনিট বিনামূল্যে কথা বলুন। কল শুরু করতে ট্যাপ করুন।',
  },
  mr: {
    title: 'दुर्गा पूजेची भेट: योगी बाबांशी बोला 🪔',
    body: 'या दुर्गा पूजेला योगी बाबांना कॉल करा आणि 3 मिनिटे मोफत बोला. कॉल सुरू करण्यासाठी टॅप करा.',
  },
  te: {
    title: 'దుర్గా పూజ కానుక: యోగి బాబాతో మాట్లాడండి 🪔',
    body: 'ఈ దుర్గా పూజకు యోగి బాబాకు కాల్ చేసి 3 నిమిషాలు ఉచితంగా మాట్లాడండి. కాల్ ప్రారంభించడానికి నొక్కండి.',
  },
  ta: {
    title: 'துர்கா பூஜை பரிசு: யோகி பாபாவுடன் பேசுங்கள் 🪔',
    body: 'இந்த துர்கா பூஜைக்கு யோகி பாபாவை அழைத்து 3 நிமிடங்கள் இலவசமாகப் பேசுங்கள். அழைப்பைத் தொடங்க தட்டவும்.',
  },
  gu: {
    title: 'દુર્ગા પૂજાની ભેટ: યોગી બાબા સાથે વાત કરો 🪔',
    body: 'આ દુર્ગા પૂજાએ યોગી બાબાને કૉલ કરો અને 3 મિનિટ મફત વાત કરો. કૉલ શરૂ કરવા ટેપ કરો.',
  },
};

export function voiceTrialLaunchCopy(locale: string | null | undefined): {
  title: string;
  body: string;
} {
  return LAUNCH_COPY[normalizeLang(locale)];
}

export interface VoiceTrialLaunchSend {
  attempted: number;
  failed: number;
  /** Users left out because an earlier send already reached them. */
  skipped: number;
}

/**
 * Sends the launch notification to every user who has not had it. With
 * `onlyUser`, sends a try-out to that one user instead (any number of times),
 * so the owner can see it first.
 */
export async function sendVoiceTrialLaunch(
  opts: { onlyUser?: { id: string; locale: string | null } } = {},
): Promise<VoiceTrialLaunchSend> {
  if (opts.onlyUser) {
    await notifyUser(opts.onlyUser.id, {
      ...voiceTrialLaunchCopy(opts.onlyUser.locale),
      type: VOICE_TRIAL_LAUNCH_TEST_TYPE,
      link: VOICE_TRIAL_LAUNCH_LINK,
    });
    return { attempted: 1, failed: 0, skipped: 0 };
  }

  const [audience, sent] = await Promise.all([
    resolveAudience(null),
    listUserIdsNotified(VOICE_TRIAL_LAUNCH_TYPE),
  ]);
  const due = audience.filter((a) => !sent.has(a.userId));
  const limit = pLimit(SEND_CONCURRENCY);
  const results = await Promise.allSettled(
    due.map((member) =>
      limit(() =>
        notifyUser(member.userId, {
          ...voiceTrialLaunchCopy(member.locale),
          type: VOICE_TRIAL_LAUNCH_TYPE,
          link: VOICE_TRIAL_LAUNCH_LINK,
        }),
      ),
    ),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) logger.error({ failed, total: due.length }, 'voice-trial-launch: some sends failed');
  return { attempted: due.length, failed, skipped: audience.length - due.length };
}
