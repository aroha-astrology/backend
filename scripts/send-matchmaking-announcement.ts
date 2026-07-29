/**
 * One-off: announce the matchmaking/compatibility upgrade to every active
 * (unrevoked, push-enabled) device token, localized per device language —
 * same grouping pattern as broadcastPeriodReading in broadcast.service.ts,
 * without the cron_batch_runs idempotency wrapper since this is a manual,
 * single run rather than a recurring job.
 *
 * Usage: npx tsx scripts/send-matchmaking-announcement.ts
 */
import { getAllActiveTokens } from '../src/modules/device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../src/lib/notifications/fcm.js';
import { normalizeLang, type LangCode } from '../src/modules/cron/broadcast-copy.js';

const COPY: Record<LangCode, { title: string; body: string }> = {
  en: {
    title: '✨ Smarter Matchmaking Is Here',
    body: 'Our compatibility engine just got a major upgrade — deeper analysis and more accurate insights into your match. Open Aroha to see what\'s new.',
  },
  hi: {
    title: '✨ अब और भी स्मार्ट कुंडली मिलान',
    body: 'हमारा मिलान इंजन अपग्रेड हो गया है — अब गहरी जानकारी और सटीक विश्लेषण के साथ। नया अनुभव देखने के लिए अभी Aroha खोलें।',
  },
  bn: {
    title: '✨ আরও স্মার্ট কুণ্ডলী মিলন এখন',
    body: 'আমাদের মিলন ইঞ্জিন বড় আপগ্রেড পেয়েছে — আরও গভীর বিশ্লেষণ এবং নির্ভুল অন্তর্দৃষ্টি সহ। নতুন অভিজ্ঞতা দেখতে এখনই Aroha খুলুন।',
  },
  mr: {
    title: '✨ आता अधिक स्मार्ट कुंडली जुळणी',
    body: 'आमचे जुळणी इंजिन मोठ्या अपग्रेडसह आले आहे — सखोल विश्लेषण आणि अचूक अंतर्दृष्टीसह. नवीन अनुभव पाहण्यासाठी आत्ताच Aroha उघडा.',
  },
  te: {
    title: '✨ ఇప్పుడు మరింత స్మార్ట్ జాతక సరిపోలిక',
    body: 'మా సరిపోలిక ఇంజిన్ పెద్ద అప్‌గ్రేడ్ పొందింది — లోతైన విశ్లేషణ మరియు ఖచ్చితమైన అంతర్దృష్టులతో. కొత్త అనుభవాన్ని చూడటానికి ఇప్పుడే Aroha తెరవండి.',
  },
  ta: {
    title: '✨ இப்போது இன்னும் ஸ்மார்ட்டான ஜாதக பொருத்தம்',
    body: 'எங்கள் பொருத்த இயந்திரம் பெரிய மேம்பாட்டைப் பெற்றுள்ளது — ஆழமான பகுப்பாய்வு மற்றும் துல்லியமான நுண்ணறிவுகளுடன். புதிய அனுபவத்தைக் காண இப்போதே Aroha-வைத் திறக்கவும்.',
  },
  gu: {
    title: '✨ હવે વધુ સ્માર્ટ કુંડળી મેળાપ',
    body: 'અમારું મેળાપ એન્જિન મોટા અપગ્રેડ સાથે આવ્યું છે — ઊંડું વિશ્લેષણ અને ચોક્કસ સૂઝ સાથે. નવો અનુભવ જોવા માટે હમણાં જ Aroha ખોલો.',
  },
};

async function main() {
  const tokens = await getAllActiveTokens();
  console.log(`Sending to ${tokens.length} active device token(s)...`);
  if (tokens.length === 0) {
    console.log('No registered devices — nothing to send.');
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
      type: 'announcement',
      navigate: '/compatibility',
    });
    console.log(`  ${lang}: ${langTokens.length} token(s) — success=${result.success} failure=${result.failure}`);
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
