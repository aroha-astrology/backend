// =============================================================================
// Aroha Pass doubled (2026-10-30): the one notification to every user
// =============================================================================
// Pass questions, free voice minutes and Question Pack sizes are twice what they
// were, and the report discount is 10 points higher (see pass.config.ts). This
// tells every user once, in their language, and opens the Pass page. A second
// send only reaches the users the first one missed. It is filed under Offers,
// so users who turned Offers off, or are in quiet hours, get it in the bell only.
//
// Sent from the server with scripts/send-pass-double-push.ts. The wording never
// mentions AI (owner's rule for anything promotional): it is Yogi Baba.
// =============================================================================

import pLimit from 'p-limit';
import { logger } from '../../lib/logger.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { normalizeLang, type LangCode } from '../cron/broadcast-copy.js';
import { resolveAudience } from '../gift-campaigns/gift-campaigns.repo.js';
import { listUserIdsNotified } from './pass.repo.js';

export const PASS_DOUBLE_TYPE = 'pass_double_launch';
/** A try-out sent to one user alone: it must not count as that user's launch notification. */
export const PASS_DOUBLE_TEST_TYPE = 'pass_double_launch_test';
export const PASS_DOUBLE_LINK = '/pass';
/** Matches the other admin broadcasts. */
const SEND_CONCURRENCY = 10;

const COPY: Record<LangCode, { title: string; body: string }> = {
  en: {
    title: 'Aroha Pass is now double 🪔',
    body: 'Twice the questions, twice the free voice minutes with Yogi Baba, and up to 40% off every report. Question Packs hold twice as many questions too. Tap to see your Pass.',
  },
  hi: {
    title: 'Aroha Pass अब दोगुना 🪔',
    body: 'अब दोगुने सवाल, योगी बाबा से दोगुने मुफ़्त कॉल मिनट और हर रिपोर्ट पर 40% तक की छूट। प्रश्न पैक में भी दोगुने सवाल। अपना पास देखने के लिए टैप करें।',
  },
  bn: {
    title: 'Aroha Pass এখন দ্বিগুণ 🪔',
    body: 'এখন দ্বিগুণ প্রশ্ন, যোগী বাবার সঙ্গে দ্বিগুণ বিনামূল্যে কল মিনিট এবং প্রতিটি রিপোর্টে ৪০% পর্যন্ত ছাড়। প্রশ্ন প্যাকেও দ্বিগুণ প্রশ্ন। আপনার পাস দেখতে ট্যাপ করুন।',
  },
  mr: {
    title: 'Aroha Pass आता दुप्पट 🪔',
    body: 'आता दुप्पट प्रश्न, योगी बाबांशी दुप्पट मोफत कॉल मिनिटे आणि प्रत्येक रिपोर्टवर 40% पर्यंत सूट. प्रश्न पॅकमध्येही दुप्पट प्रश्न. तुमचा पास पाहण्यासाठी टॅप करा.',
  },
  te: {
    title: 'Aroha Pass ఇప్పుడు రెట్టింపు 🪔',
    body: 'ఇప్పుడు రెట్టింపు ప్రశ్నలు, యోగి బాబాతో రెట్టింపు ఉచిత కాల్ నిమిషాలు, ప్రతి రిపోర్ట్‌పై 40% వరకు తగ్గింపు. ప్రశ్న ప్యాక్‌లలో కూడా రెట్టింపు ప్రశ్నలు. మీ పాస్ చూడటానికి నొక్కండి.',
  },
  ta: {
    title: 'Aroha Pass இப்போது இரட்டிப்பு 🪔',
    body: 'இப்போது இரட்டிப்பு கேள்விகள், யோகி பாபாவுடன் இரட்டிப்பு இலவச அழைப்பு நிமிடங்கள், ஒவ்வொரு அறிக்கையிலும் 40% வரை தள்ளுபடி. கேள்வி பேக்குகளிலும் இரட்டிப்பு கேள்விகள். உங்கள் பாஸைப் பார்க்கத் தட்டவும்.',
  },
  gu: {
    title: 'Aroha Pass હવે બમણું 🪔',
    body: 'હવે બમણા પ્રશ્નો, યોગી બાબા સાથે બમણી મફત કૉલ મિનિટ અને દરેક રિપોર્ટ પર 40% સુધી છૂટ. પ્રશ્ન પેકમાં પણ બમણા પ્રશ્નો. તમારો પાસ જોવા માટે ટેપ કરો.',
  },
};

export function passDoubleCopy(locale: string | null | undefined): { title: string; body: string } {
  return COPY[normalizeLang(locale)];
}

export interface PassDoubleSend {
  attempted: number;
  failed: number;
  /** Users left out because an earlier send already reached them. */
  skipped: number;
}

/**
 * Sends the notification to every user who has not had it. With `onlyUser`,
 * sends a try-out to that one user instead (any number of times), so the owner
 * can see it first.
 */
export async function sendPassDouble(
  opts: { onlyUser?: { id: string; locale: string | null } } = {},
): Promise<PassDoubleSend> {
  if (opts.onlyUser) {
    await notifyUser(opts.onlyUser.id, {
      ...passDoubleCopy(opts.onlyUser.locale),
      type: PASS_DOUBLE_TEST_TYPE,
      link: PASS_DOUBLE_LINK,
    });
    return { attempted: 1, failed: 0, skipped: 0 };
  }

  const [audience, sent] = await Promise.all([
    resolveAudience(null),
    listUserIdsNotified(PASS_DOUBLE_TYPE),
  ]);
  const due = audience.filter((a) => !sent.has(a.userId));
  const limit = pLimit(SEND_CONCURRENCY);
  const results = await Promise.allSettled(
    due.map((member) =>
      limit(() =>
        notifyUser(member.userId, {
          ...passDoubleCopy(member.locale),
          type: PASS_DOUBLE_TYPE,
          link: PASS_DOUBLE_LINK,
        }),
      ),
    ),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) logger.error({ failed, total: due.length }, 'pass-double: some sends failed');
  return { attempted: due.length, failed, skipped: audience.length - due.length };
}
