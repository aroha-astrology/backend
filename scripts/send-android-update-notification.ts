/**
 * One-off: notify Android users about the latest app update (fixes crashes
 * on some devices), localized per device language — same grouping pattern as
 * broadcastPeriodReading in broadcast.service.ts, without the cron_batch_runs
 * idempotency wrapper since this is a manual, single run rather than a
 * recurring job. Android only — filters on device_push_tokens.platform.
 *
 * Usage: npx tsx scripts/send-android-update-notification.ts
 */
import { getAllActiveTokens } from '../src/modules/device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../src/lib/notifications/fcm.js';
import { normalizeLang, type LangCode } from '../src/modules/cron/broadcast-copy.js';

const COPY: Record<LangCode, { title: string; body: string }> = {
  en: {
    title: '🔧 App Update Available',
    body: "We've released a new update that fixes crashes some of you were seeing. Update now for a smoother experience.",
  },
  hi: {
    title: '🔧 ऐप अपडेट उपलब्ध है',
    body: 'हमने एक नया अपडेट जारी किया है जो कुछ डिवाइस पर आ रही क्रैश की समस्या को ठीक करता है। बेहतर अनुभव के लिए अभी अपडेट करें।',
  },
  bn: {
    title: '🔧 অ্যাপ আপডেট উপলব্ধ',
    body: 'আমরা একটি নতুন আপডেট প্রকাশ করেছি যা কিছু ডিভাইসে ক্র্যাশ হওয়ার সমস্যা ঠিক করে। আরও ভালো অভিজ্ঞতার জন্য এখনই আপডেট করুন।',
  },
  mr: {
    title: '🔧 अ‍ॅप अपडेट उपलब्ध आहे',
    body: 'आम्ही एक नवीन अपडेट जारी केले आहे जे काही डिव्हाइसवरील क्रॅशच्या समस्येचे निराकरण करते. उत्तम अनुभवासाठी आत्ताच अपडेट करा.',
  },
  te: {
    title: '🔧 యాప్ అప్‌డేట్ అందుబాటులో ఉంది',
    body: 'కొన్ని పరికరాల్లో వస్తున్న క్రాష్‌లను సరిచేసే కొత్త అప్‌డేట్‌ను మేము విడుదల చేశాము. మెరుగైన అనుభవం కోసం ఇప్పుడే అప్‌డేట్ చేయండి.',
  },
  ta: {
    title: '🔧 ஆப் புதுப்பிப்பு கிடைக்கிறது',
    body: 'சில சாதனங்களில் ஏற்பட்ட கிராஷ்களை சரிசெய்யும் புதிய புதுப்பிப்பை நாங்கள் வெளியிட்டுள்ளோம். சிறந்த அனுபவத்திற்கு இப்போதே புதுப்பிக்கவும்.',
  },
  gu: {
    title: '🔧 એપ અપડેટ ઉપલબ્ધ છે',
    body: 'અમે એક નવું અપડેટ બહાર પાડ્યું છે જે કેટલાક ડિવાઇસ પર થતી ક્રેશની સમસ્યાને ઠીક કરે છે. વધુ સારા અનુભવ માટે હમણાં જ અપડેટ કરો.',
  },
};

async function main() {
  const tokens = (await getAllActiveTokens()).filter((t) => t.platform === 'android');
  console.log(`Sending to ${tokens.length} active Android device token(s)...`);
  if (tokens.length === 0) {
    console.log('No registered Android devices — nothing to send.');
    return;
  }

  const byLang = new Map<LangCode, string[]>();
  for (const t of tokens) {
    const lang = normalizeLang(t.locale);
    const list = byLang.get(lang);
    if (list) list.push(t.token);
    else byLang.set(lang, [t.token]);
  }

  let success = 0;
  let failure = 0;
  for (const [lang, langTokens] of byLang) {
    const copy = COPY[lang];
    const result = await sendPushBatch(langTokens, copy.title, copy.body, {
      type: 'app_update_notice',
    });
    console.log(
      `  ${lang}: ${langTokens.length} token(s) — success=${result.success} failure=${result.failure}`,
    );
    success += result.success;
    failure += result.failure;
  }

  console.log(`Done. success=${success} failure=${failure}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
