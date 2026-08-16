/**
 * One-off: announce the ₹100 "wallet running low" claim (campaign
 * `top_up_bonus_2026_08_16`) to every user the offer is actually for — wallet
 * under ₹100, account not awaiting deletion, at least one live push token.
 *
 * Two deliberate differences from send-independence-day-broadcast.ts:
 *  - Language comes from `users.locale` (set at onboarding), NOT
 *    `device_push_tokens.locale` — the frontend never sends a token locale, so
 *    grouping on it silently pushes English to everyone.
 *  - Users who signed up TODAY are skipped: they already got the ₹500 starting
 *    balance and the claim route refuses them, so a push would only mislead.
 *
 * Dry-run by default — prints the audience and sends nothing. Pass --send to
 * actually push.
 *   npx tsx scripts/send-top-up-bonus-broadcast.ts          # dry run
 *   npx tsx scripts/send-top-up-bonus-broadcast.ts --send   # for real
 */
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '../src/config/db.js';
import { devicePushTokens, users } from '../src/db/schema.js';
import { sendPushBatch } from '../src/lib/notifications/fcm.js';
import { insertNotifications } from '../src/modules/users/users.repo.js';
import { normalizeLang, type LangCode } from '../src/modules/cron/broadcast-copy.js';
import { istDateString } from '../src/lib/astro-tools/transit-events.js';

/** Must match the campaign's `maxBalancePaise` in src/config/campaigns.ts. */
const MAX_BALANCE_PAISE = 10000;
/** Must match the campaign's `istDate` — today's signups are ineligible. */
const IST_DATE = '2026-08-16';

const COPY: Record<LangCode, { title: string; body: string }> = {
  en: {
    title: '🎁 ₹100 is on us',
    body: 'Your wallet is running low, so here is ₹100 — no strings. Open the app to claim it today, and share Aroha with friends to earn more.',
  },
  hi: {
    title: '🎁 ₹100 हमारी ओर से',
    body: 'आपका बैलेंस कम है, इसलिए ₹100 हमारी ओर से — बिना किसी शर्त के। आज ही ऐप खोलकर पाएं, और दोस्तों के साथ Aroha शेयर करके और कमाएं।',
  },
  bn: {
    title: '🎁 ₹১০০ আমাদের পক্ষ থেকে',
    body: 'আপনার ব্যালেন্স কমে এসেছে, তাই ₹১০০ আমাদের পক্ষ থেকে — কোনো শর্ত ছাড়াই। আজই অ্যাপ খুলে নিন, আর বন্ধুদের সাথে Aroha শেয়ার করে আরও উপার্জন করুন।',
  },
  mr: {
    title: '🎁 ₹100 आमच्याकडून',
    body: 'तुमची शिल्लक कमी आहे, म्हणून ₹100 आमच्याकडून — कोणत्याही अटीशिवाय. आजच अ‍ॅप उघडून मिळवा, आणि मित्रांसोबत Aroha शेअर करून आणखी कमवा.',
  },
  te: {
    title: '🎁 ₹100 మా తరపు నుండి',
    body: 'మీ బ్యాలెన్స్ తగ్గిపోయింది, అందుకే ₹100 మా తరపు నుండి — ఎలాంటి షరతులు లేవు. ఈ రోజే యాప్ తెరిచి పొందండి, స్నేహితులతో Aroha పంచుకుని మరింత సంపాదించండి.',
  },
  ta: {
    title: '🎁 ₹100 எங்கள் சார்பாக',
    body: 'உங்கள் இருப்பு குறைந்துவிட்டது, எனவே ₹100 எங்கள் சார்பாக — எந்த நிபந்தனையும் இல்லை. இன்றே ஆப்பைத் திறந்து பெறுங்கள், நண்பர்களுடன் Aroha பகிர்ந்து மேலும் சம்பாதியுங்கள்.',
  },
  gu: {
    title: '🎁 ₹100 અમારા તરફથી',
    body: 'તમારું બેલેન્સ ઓછું છે, તેથી ₹100 અમારા તરફથી — કોઈ શરત વગર. આજે જ એપ ખોલીને મેળવો, અને મિત્રો સાથે Aroha શેર કરીને વધુ કમાઓ.',
  },
};

async function main() {
  const send = process.argv.includes('--send');

  const rows = await db
    .select({
      userId: users.id,
      locale: users.locale,
      createdAt: users.createdAt,
      token: devicePushTokens.token,
    })
    .from(users)
    .innerJoin(devicePushTokens, eq(devicePushTokens.userId, users.id))
    .where(
      and(
        lt(users.walletBalancePaise, MAX_BALANCE_PAISE),
        isNull(users.deletedAt),
        isNull(users.deletionRequestedAt),
        isNull(devicePushTokens.revokedAt),
        or(isNull(devicePushTokens.pushEnabled), eq(devicePushTokens.pushEnabled, true)),
      ),
    );

  const eligible = rows.filter((r) => istDateString(r.createdAt) !== IST_DATE);
  const skippedNewToday = rows.length - eligible.length;

  const byLang = new Map<LangCode, string[]>();
  const seenUserIds = new Set<string>();
  const inboxEntries: {
    userId: string;
    title: string;
    body: string;
    type: string;
    link: string;
  }[] = [];

  for (const r of eligible) {
    const lang = normalizeLang(r.locale);
    const list = byLang.get(lang);
    if (list) list.push(r.token);
    else byLang.set(lang, [r.token]);

    if (!seenUserIds.has(r.userId)) {
      seenUserIds.add(r.userId);
      const copy = COPY[lang];
      inboxEntries.push({
        userId: r.userId,
        title: copy.title,
        body: copy.body,
        type: 'announcement',
        link: '/',
      });
    }
  }

  console.log(
    `Audience: ${seenUserIds.size} user(s), ${eligible.length} device token(s)` +
      (skippedNewToday > 0
        ? ` (skipped ${skippedNewToday} token(s) of users who signed up today)`
        : ''),
  );
  for (const [lang, langTokens] of byLang) console.log(`  ${lang}: ${langTokens.length} token(s)`);

  if (!send) {
    console.log('\nDry run — nothing sent. Re-run with --send to push.');
    return;
  }
  if (eligible.length === 0) {
    console.log('Nobody to notify.');
    return;
  }

  await insertNotifications(inboxEntries);
  console.log(`Wrote ${inboxEntries.length} Bell inbox row(s).`);

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
