/**
 * One-off: announce the Independence Day 2026 ₹500 claim to every active
 * (unrevoked, push-enabled) device token, localized per device language —
 * same grouping pattern as send-matchmaking-announcement.ts. Also writes the
 * Bell inbox (that script didn't), one row per USER (not per device — a
 * two-phone user would otherwise get a duplicate inbox row even though
 * getAllActiveTokens() returns one row per device).
 *
 * Usage: npx tsx scripts/send-independence-day-broadcast.ts
 */
import { getAllActiveTokens } from '../src/modules/device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../src/lib/notifications/fcm.js';
import { insertNotifications } from '../src/modules/users/users.repo.js';
import { normalizeLang, type LangCode } from '../src/modules/cron/broadcast-copy.js';

const COPY: Record<LangCode, { title: string; body: string }> = {
  en: {
    title: '🇮🇳 Happy Independence Day — ₹500 is waiting',
    body: 'Freedom to ask the stars anything. Claim your ₹500 gift inside the app — today only.',
  },
  hi: {
    title: '🇮🇳 स्वतंत्रता दिवस की शुभकामनाएं — ₹500 आपका इंतज़ार कर रहे हैं',
    body: 'सितारों से कुछ भी पूछने की आज़ादी। ऐप में अपना ₹500 का तोहफ़ा पाएं — सिर्फ़ आज।',
  },
  bn: {
    title: '🇮🇳 স্বাধীনতা দিবসের শুভেচ্ছা — ₹৫০০ অপেক্ষা করছে',
    body: 'তারাদের কাছে যা খুশি জিজ্ঞাসা করার স্বাধীনতা। অ্যাপে আপনার ₹৫০০ উপহার নিন — শুধু আজই।',
  },
  mr: {
    title: '🇮🇳 स्वातंत्र्य दिनाच्या शुभेच्छा — ₹500 तुमची वाट पाहत आहेत',
    body: 'ताऱ्यांना काहीही विचारण्याचे स्वातंत्र्य. अ‍ॅपमध्ये तुमची ₹500 ची भेट घ्या — फक्त आजच.',
  },
  te: {
    title: '🇮🇳 స్వాతంత్ర్య దినోత్సవ శుభాకాంక్షలు — ₹500 మీ కోసం వేచి ఉంది',
    body: 'నక్షత్రాలను ఏదైనా అడిగే స్వేచ్ఛ. యాప్‌లో మీ ₹500 బహుమతిని పొందండి — ఈ రోజు మాత్రమే.',
  },
  ta: {
    title: '🇮🇳 சுதந்திர தின நல்வாழ்த்துக்கள் — ₹500 காத்திருக்கிறது',
    body: 'நட்சத்திரங்களிடம் எதுவும் கேட்கும் சுதந்திரம். ஆப்பில் உங்கள் ₹500 பரிசைப் பெறுங்கள் — இன்று மட்டும்.',
  },
  gu: {
    title: '🇮🇳 સ્વતંત્રતા દિવસની શુભકામનાઓ — ₹500 તમારી રાહ જોઈ રહ્યા છે',
    body: 'તારાઓને કંઈપણ પૂછવાની આઝાદી. એપમાં તમારી ₹500 ની ભેટ મેળવો — ફક્ત આજે જ.',
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
  const seenUserIds = new Set<string>();
  const inboxEntries: {
    userId: string;
    title: string;
    body: string;
    type: string;
    link: string;
  }[] = [];

  for (const t of tokens) {
    const lang = normalizeLang(t.locale);
    const list = byLang.get(lang);
    if (list) list.push(t.token);
    else byLang.set(lang, [t.token]);

    if (!seenUserIds.has(t.userId)) {
      seenUserIds.add(t.userId);
      const copy = COPY[lang];
      inboxEntries.push({
        userId: t.userId,
        title: copy.title,
        body: copy.body,
        type: 'announcement',
        link: '/',
      });
    }
  }

  await insertNotifications(inboxEntries);
  console.log(`Wrote ${inboxEntries.length} Bell inbox row(s) for ${seenUserIds.size} user(s).`);

  let success = 0;
  let failure = 0;
  for (const [lang, langTokens] of byLang) {
    const copy = COPY[lang];
    const result = await sendPushBatch(langTokens, copy.title, copy.body, {
      type: 'announcement',
      navigate: '/',
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
