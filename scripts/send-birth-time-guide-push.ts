// Tells one user, in their language, how to find their birth time in the app
// (Account Settings → Birth Time Confidence), for a user who asked Baba Ji
// "find my birth time" before the chat knew the screen existed. See
// src/lib/chat-app-guide.ts.
//
//   npx tsx scripts/send-birth-time-guide-push.ts <userId> --dry-run   prints it, sends nothing
//   npx tsx scripts/send-birth-time-guide-push.ts <userId>             sends it
//
// Refuses when the Birth Time Confidence switch is off for that user, so it
// never points anyone to a screen they cannot see. Not filed under Offers: it
// answers their own question, so it comes through like a support reply. The
// wording never mentions AI (owner's rule): it is Yogi Baba.
import 'dotenv/config';
import { sqlClient } from '../src/config/db.js';
import { passEntitlement } from '../src/lib/entitlements.js';
import { logger } from '../src/lib/logger.js';
import { notifyUser } from '../src/lib/notifications/notify-user.js';
import { normalizeLang, type LangCode } from '../src/modules/cron/broadcast-copy.js';
import { resolveFeaturesForUser } from '../src/modules/features/features.service.js';
import { findActiveUserById } from '../src/modules/users/users.repo.js';

const TYPE = 'feature_guide_birth_time';
const LINK = '/settings';

const COPY: Record<LangCode, { title: string; body: string; pass: string }> = {
  en: {
    title: 'Find your exact birth time 🕉️',
    body: 'Open ☰ Menu → Account Settings → Birth Time Confidence. Add 3 or more big life events with their dates, and Yogi Baba suggests your real birth time.',
    pass: ' It is part of Aroha Pass Gold.',
  },
  hi: {
    title: 'अपना सही जन्म समय जानें 🕉️',
    body: '☰ मेनू → खाता सेटिंग्स → जन्म समय पर भरोसा खोलें। अपने जीवन की 3 या अधिक बड़ी घटनाएँ तारीख़ के साथ जोड़ें, और योगी बाबा आपका असली जन्म समय बताएँगे।',
    pass: ' यह Aroha Pass Gold का हिस्सा है।',
  },
  bn: {
    title: 'আপনার সঠিক জন্মসময় জানুন 🕉️',
    body: '☰ মেনু → অ্যাকাউন্ট সেটিংস → জন্মসময়ে আস্থা খুলুন। জীবনের ৩ বা তার বেশি বড় ঘটনা তারিখসহ যোগ করুন, যোগী বাবা আপনার আসল জন্মসময় জানাবেন।',
    pass: ' এটি Aroha Pass Gold-এর অংশ।',
  },
  mr: {
    title: 'तुमची अचूक जन्मवेळ जाणून घ्या 🕉️',
    body: '☰ मेनू → खाते सेटिंग्ज → जन्मवेळेवरील विश्वास उघडा. आयुष्यातील 3 किंवा अधिक मोठ्या घटना तारखेसह जोडा, आणि योगी बाबा तुमची खरी जन्मवेळ सुचवतील.',
    pass: ' हे Aroha Pass Gold चा भाग आहे.',
  },
  te: {
    title: 'మీ సరైన జనన సమయం తెలుసుకోండి 🕉️',
    body: '☰ మెనూ → ఖాతా సెట్టింగ్‌లు → జన్మ సమయంపై నమ్మకం తెరవండి. జీవితంలోని 3 లేదా అంతకంటే ఎక్కువ పెద్ద సంఘటనలను తేదీలతో జోడించండి, యోగి బాబా మీ అసలు జనన సమయాన్ని సూచిస్తారు.',
    pass: ' ఇది Aroha Pass Goldలో భాగం.',
  },
  ta: {
    title: 'உங்கள் சரியான பிறந்த நேரத்தை அறியுங்கள் 🕉️',
    body: '☰ மெனு → கணக்கு அமைப்புகள் → பிறந்த நேரத்தில் நம்பிக்கை திறக்கவும். வாழ்க்கையின் 3 அல்லது அதற்கு மேற்பட்ட பெரிய நிகழ்வுகளைத் தேதியுடன் சேர்க்கவும், யோகி பாபா உங்கள் உண்மையான பிறந்த நேரத்தைச் சொல்வார்.',
    pass: ' இது Aroha Pass Gold-இன் ஒரு பகுதி.',
  },
  gu: {
    title: 'તમારો સાચો જન્મ સમય જાણો 🕉️',
    body: '☰ મેનૂ → ખાતા સેટિંગ્સ → જન્મ સમય પર વિશ્વાસ ખોલો. જીવનની 3 કે વધુ મોટી ઘટનાઓ તારીખ સાથે ઉમેરો, અને યોગી બાબા તમારો સાચો જન્મ સમય સૂચવશે.',
    pass: ' આ Aroha Pass Goldનો ભાગ છે.',
  },
};

async function main() {
  const [userId, flag] = process.argv.slice(2);
  if (!userId || (flag && flag !== '--dry-run')) {
    throw new Error('Usage: send-birth-time-guide-push.ts <userId> [--dry-run]');
  }

  const user = await findActiveUserById(userId);
  if (!user) throw new Error(`No active user ${userId}`);
  const features = await resolveFeaturesForUser(user.id);
  if (!features['home.birthTimeConfidence']?.enabled) {
    throw new Error(
      'The Birth Time Confidence switch (home.birthTimeConfidence) is off for this user; turn it on in Admin → Features first.',
    );
  }

  const pass = await passEntitlement(user.id);
  const copy = COPY[normalizeLang(user.locale)];
  const body = pass?.features.includes('birthTime') ? copy.body : copy.body + copy.pass;
  const payload = { title: copy.title, body, type: TYPE, link: LINK };

  if (flag === '--dry-run') {
    logger.info(
      { userId: user.id, locale: user.locale, hasPass: !!pass, ...payload },
      'birth-time guide: dry run, nothing sent',
    );
  } else {
    await notifyUser(user.id, payload);
    logger.info({ userId: user.id, ...payload }, 'birth-time guide: sent');
  }

  await sqlClient.end();
}

main().catch((err) => {
  logger.error({ err }, 'send-birth-time-guide-push failed');
  process.exit(1);
});
