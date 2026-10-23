// =============================================================================
// Dussehra 2026 gift: the one notification to every user who got it
// =============================================================================
// Every user who existed on 20 Oct 2026 gets 2 free chat questions until
// 21 Oct 11:59 PM IST (config/chat-gifts.ts). This tells them, once each, in
// their language, and opens the chat. Only users holding the gift are told, so
// nobody hears about questions they don't have. A second send only reaches the
// users the first one missed. Filed under Offers, so users who turned Offers
// off, or are in quiet hours, get it in the bell only.
//
// Sent from the server with scripts/send-chat-gift-push.ts, after the deploy.
// The wording never mentions AI (owner's rule for anything promotional): it is
// Yogi Baba.
// =============================================================================

import pLimit from 'p-limit';
import { logger } from '../../lib/logger.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { normalizeLang, type LangCode } from '../cron/broadcast-copy.js';
import { DUSSEHRA_2026_GIFT, type ChatGiftCampaign } from '../../config/chat-gifts.js';
import { listChatGiftHolders } from './chat-gifts.repo.js';
import { listUserIdsNotified } from './pass.repo.js';

export const CHAT_GIFT_LAUNCH_TYPE = 'chat_gift_dussehra_2026';
/** A try-out sent to the admin alone: it must not count as that admin's launch notification. */
export const CHAT_GIFT_LAUNCH_TEST_TYPE = 'chat_gift_dussehra_2026_test';
export const CHAT_GIFT_LAUNCH_LINK = '/ai-chat';
/** Matches the other admin broadcasts. */
const SEND_CONCURRENCY = 10;

/**
 * {{questions}}, {{date}} and {{time}} are filled from DUSSEHRA_2026_GIFT
 * (config/chat-gifts.ts), the one place the gift's size and end are set, so
 * the push can never promise a different count or deadline from the one the
 * billing enforces.
 */
const LAUNCH_COPY: Record<LangCode, { title: string; body: string }> = {
  en: {
    title: '🏹 Happy Dussehra! Yogi Baba just got sharper',
    body: 'His readings now follow the exact planetary dates and times. To celebrate, your next {{questions}} questions are on us. Ask before {{date}}, {{time}}.',
  },
  hi: {
    title: '🏹 दशहरा की शुभकामनाएँ! योगी बाबा अब और सटीक',
    body: 'अब उनके उत्तर ग्रहों की सही तारीख़ और समय पर आधारित हैं। इस ख़ुशी में आपके अगले {{questions}} सवाल हमारी ओर से मुफ़्त। {{date}}, {{time}} तक पूछें।',
  },
  bn: {
    title: '🏹 শুভ বিজয়া! যোগী বাবা এখন আরও নির্ভুল',
    body: 'এখন তাঁর উত্তর গ্রহের সঠিক তারিখ ও সময় মেনে চলে। তাই আপনার পরের {{questions}}টি প্রশ্ন আমাদের তরফ থেকে বিনামূল্যে। {{date}}, {{time}}-এর মধ্যে জিজ্ঞেস করুন।',
  },
  mr: {
    title: '🏹 दसऱ्याच्या शुभेच्छा! योगी बाबा आता अधिक अचूक',
    body: 'आता त्यांची उत्तरे ग्रहांच्या अचूक तारखा आणि वेळेवर आधारित आहेत. यानिमित्त तुमचे पुढचे {{questions}} प्रश्न आमच्याकडून मोफत. {{date}}, {{time}} पर्यंत विचारा.',
  },
  te: {
    title: '🏹 దసరా శుభాకాంక్షలు! యోగి బాబా ఇప్పుడు మరింత ఖచ్చితంగా',
    body: 'ఇప్పుడు ఆయన సమాధానాలు గ్రహాల ఖచ్చితమైన తేదీలు, సమయాలను అనుసరిస్తాయి. ఈ సందర్భంగా మీ తదుపరి {{questions}} ప్రశ్నలు మా తరఫున ఉచితం. {{date}}, {{time}} లోపు అడగండి.',
  },
  ta: {
    title: '🏹 விஜயதசமி வாழ்த்துகள்! யோகி பாபா இப்போது இன்னும் துல்லியமாக',
    body: 'இப்போது அவரது பதில்கள் கிரகங்களின் சரியான தேதிகள், நேரங்களைப் பின்பற்றுகின்றன. இதைக் கொண்டாட உங்கள் அடுத்த {{questions}} கேள்விகள் எங்கள் சார்பில் இலவசம். {{date}}, {{time}} க்குள் கேளுங்கள்.',
  },
  gu: {
    title: '🏹 દશેરાની શુભેચ્છા! યોગી બાબા હવે વધુ સચોટ',
    body: 'હવે તેમના જવાબો ગ્રહોની ચોક્કસ તારીખો અને સમય પર આધારિત છે. આ ખુશીમાં તમારા આગલા {{questions}} પ્રશ્નો અમારા તરફથી મફત. {{date}}, {{time}} સુધીમાં પૂછો.',
  },
};

/** Day and month, then the clock time, in the reader's language and IST (latin digits). */
function deadlineParts(lang: LangCode, until: Date): { date: string; time: string } {
  const opts = { timeZone: 'Asia/Kolkata', numberingSystem: 'latn' } as const;
  const locale = `${lang}-IN`;
  return {
    date: new Intl.DateTimeFormat(locale, { ...opts, day: 'numeric', month: 'long' }).format(until),
    time: new Intl.DateTimeFormat(locale, { ...opts, hour: 'numeric', minute: '2-digit' }).format(
      until,
    ),
  };
}

export function chatGiftLaunchCopy(
  locale: string | null | undefined,
  campaign: ChatGiftCampaign = DUSSEHRA_2026_GIFT,
): { title: string; body: string } {
  const lang = normalizeLang(locale);
  const { date, time } = deadlineParts(lang, campaign.validUntil);
  const copy = LAUNCH_COPY[lang];
  return {
    title: copy.title,
    body: copy.body
      .replace('{{questions}}', String(campaign.questions))
      .replace('{{date}}', date)
      .replace('{{time}}', time),
  };
}

export interface ChatGiftLaunchSend {
  attempted: number;
  failed: number;
  /** Users left out because an earlier send already reached them. */
  skipped: number;
}

/**
 * Sends the announcement to every gift holder who has not had it. With
 * `onlyUser`, sends a try-out to that one user instead (any number of times),
 * so the owner can see it first.
 */
export async function sendChatGiftLaunch(
  opts: { onlyUser?: { id: string; locale: string | null } } = {},
): Promise<ChatGiftLaunchSend> {
  if (opts.onlyUser) {
    await notifyUser(opts.onlyUser.id, {
      ...chatGiftLaunchCopy(opts.onlyUser.locale),
      type: CHAT_GIFT_LAUNCH_TEST_TYPE,
      link: CHAT_GIFT_LAUNCH_LINK,
    });
    return { attempted: 1, failed: 0, skipped: 0 };
  }

  const [holders, sent] = await Promise.all([
    listChatGiftHolders(DUSSEHRA_2026_GIFT.key),
    listUserIdsNotified(CHAT_GIFT_LAUNCH_TYPE),
  ]);
  const due = holders.filter((h) => !sent.has(h.userId));
  const limit = pLimit(SEND_CONCURRENCY);
  const results = await Promise.allSettled(
    due.map((member) =>
      limit(() =>
        notifyUser(member.userId, {
          ...chatGiftLaunchCopy(member.locale),
          type: CHAT_GIFT_LAUNCH_TYPE,
          link: CHAT_GIFT_LAUNCH_LINK,
        }),
      ),
    ),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0)
    logger.error({ failed, total: due.length }, 'chat-gift-launch: some sends failed');
  return { attempted: due.length, failed, skipped: holders.length - due.length };
}
