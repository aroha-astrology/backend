/**
 * One-off: broadcast the "Something shifted in your chart today" re-engagement
 * push to every active (unrevoked, push-enabled) device token, localized per
 * device locale — same grouping pattern as broadcastPeriodReading in
 * broadcast.service.ts, but for an ad-hoc send with no cron_batch_runs
 * idempotency (this is a single manual run, not a recurring job).
 *
 * Usage: npx tsx scripts/send-chart-shift-broadcast.ts
 */
import { getAllActiveTokens } from '../src/modules/device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../src/lib/notifications/fcm.js';
import { normalizeLang, type LangCode } from '../src/modules/cron/broadcast-copy.js';

const COPY: Record<LangCode, { title: string; body: string }> = {
  en: {
    title: '✨ Something shifted in your chart today',
    body: 'The sky moved since you last checked. Open Aroha to see what it means for you right now.',
  },
  hi: {
    title: '✨ आज आपकी कुंडली में कुछ बदला है',
    body: 'पिछली बार देखने के बाद से आसमान बदल गया है। अभी खोलें और जानें इसका आपके लिए क्या मतलब है।',
  },
  bn: {
    title: '✨ আজ আপনার কুণ্ডলীতে কিছু বদলেছে',
    body: 'শেষবার দেখার পর থেকে আকাশ বদলে গেছে। এখনই অরোহা খুলুন আর জানুন এর মানে আপনার জন্য কী।',
  },
  mr: {
    title: '✨ आज तुमच्या कुंडलीत काहीतरी बदलले आहे',
    body: 'तुम्ही शेवटचे पाहिल्यापासून आकाश बदलले आहे. आत्ताच अरोहा उघडा आणि जाणून घ्या याचा तुमच्यासाठी काय अर्थ आहे.',
  },
  te: {
    title: '✨ ఈరోజు మీ జాతకంలో ఏదో మారింది',
    body: 'మీరు చివరిసారి చూసినప్పటి నుండి ఆకాశం మారింది. ఇప్పుడే అరోహను తెరిచి దీని అర్థం ఏమిటో తెలుసుకోండి.',
  },
  ta: {
    title: '✨ இன்று உங்கள் ஜாதகத்தில் ஏதோ மாறியுள்ளது',
    body: 'நீங்கள் கடைசியாகப் பார்த்ததிலிருந்து வானம் மாறிவிட்டது. இப்போதே அரோஹாவைத் திறந்து இது உங்களுக்கு என்ன அர்த்தம் என்று அறியுங்கள்.',
  },
  gu: {
    title: '✨ આજે તમારી કુંડળીમાં કંઈક બદલાયું છે',
    body: 'તમે છેલ્લે જોયું ત્યારથી આકાશ બદલાયું છે. હમણાં જ અરોહા ખોલો અને જાણો તેનો તમારા માટે શું અર્થ છે.',
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
      type: 'ad_hoc_reengagement',
      navigate: '/horoscope',
    });
    console.log(
      `${lang}: ${langTokens.length} token(s) — success=${result.success} failure=${result.failure}`,
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
