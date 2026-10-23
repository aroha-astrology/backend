// =============================================================================
// Aroha Pass payment notices: what a Google Play subscriber is told when the
// renewal payment fails and when it comes back (pass-play.service.ts sends
// them on the state change, once per change). In the user's language, like
// the launch notification; every notice opens /pass, which shows the
// "fix payment in Google Play" button.
// =============================================================================

import { normalizeLang, type LangCode } from '../cron/broadcast-copy.js';

export type PassNotice = 'grace' | 'hold' | 'recovered';

const COPY: Record<PassNotice, Record<LangCode, { title: string; body: string }>> = {
  grace: {
    en: {
      title: 'Your Aroha Pass payment did not go through',
      body: 'Your Pass still works for now. Update your payment method in Google Play so you keep it.',
    },
    hi: {
      title: 'आपके Aroha Pass का भुगतान नहीं हो पाया',
      body: 'आपका Pass अभी चल रहा है। इसे बनाए रखने के लिए Google Play में अपना भुगतान तरीका अपडेट करें।',
    },
    bn: {
      title: 'আপনার Aroha Pass-এর পেমেন্ট হয়নি',
      body: 'আপনার Pass এখনও চালু আছে। এটি রাখতে Google Play-তে আপনার পেমেন্ট পদ্ধতি আপডেট করুন।',
    },
    mr: {
      title: 'तुमच्या Aroha Pass चे पेमेंट झाले नाही',
      body: 'तुमचा Pass सध्या सुरू आहे. तो टिकवण्यासाठी Google Play मध्ये तुमची पेमेंट पद्धत अपडेट करा.',
    },
    te: {
      title: 'మీ Aroha Pass చెల్లింపు జరగలేదు',
      body: 'మీ Pass ప్రస్తుతానికి పనిచేస్తోంది. దాన్ని కొనసాగించడానికి Google Playలో మీ చెల్లింపు పద్ధతిని అప్‌డేట్ చేయండి.',
    },
    ta: {
      title: 'உங்கள் Aroha Pass கட்டணம் செலுத்தப்படவில்லை',
      body: 'உங்கள் Pass இப்போதைக்கு வேலை செய்கிறது. அதைத் தொடர Google Play-இல் உங்கள் கட்டண முறையைப் புதுப்பிக்கவும்.',
    },
    gu: {
      title: 'તમારા Aroha Pass ની ચુકવણી થઈ નથી',
      body: 'તમારો Pass હમણાં ચાલુ છે. તેને જાળવી રાખવા Google Play માં તમારી ચુકવણી પદ્ધતિ અપડેટ કરો.',
    },
  },
  hold: {
    en: {
      title: 'Your Aroha Pass is on hold',
      body: 'Google Play could not take the payment, so your Pass benefits are paused. Fix the payment method in Google Play and they come back straight away.',
    },
    hi: {
      title: 'आपका Aroha Pass रुका हुआ है',
      body: 'Google Play भुगतान नहीं ले पाया, इसलिए आपके Pass के फ़ायदे रुके हैं। Google Play में भुगतान तरीका ठीक करें, फ़ायदे तुरंत लौट आएँगे।',
    },
    bn: {
      title: 'আপনার Aroha Pass স্থগিত আছে',
      body: 'Google Play পেমেন্ট নিতে পারেনি, তাই আপনার Pass-এর সুবিধা বন্ধ আছে। Google Play-তে পেমেন্ট পদ্ধতি ঠিক করুন, সুবিধা সঙ্গে সঙ্গে ফিরে আসবে।',
    },
    mr: {
      title: 'तुमचा Aroha Pass थांबला आहे',
      body: 'Google Play ला पेमेंट घेता आले नाही, म्हणून तुमच्या Pass चे फायदे थांबले आहेत. Google Play मध्ये पेमेंट पद्धत दुरुस्त करा, फायदे लगेच परत येतील.',
    },
    te: {
      title: 'మీ Aroha Pass నిలిపివేయబడింది',
      body: 'Google Play చెల్లింపు తీసుకోలేకపోయింది, కాబట్టి మీ Pass ప్రయోజనాలు ఆగిపోయాయి. Google Playలో చెల్లింపు పద్ధతిని సరిచేయండి, అవి వెంటనే తిరిగి వస్తాయి.',
    },
    ta: {
      title: 'உங்கள் Aroha Pass நிறுத்தி வைக்கப்பட்டுள்ளது',
      body: 'Google Play கட்டணத்தைப் பெற முடியவில்லை, அதனால் உங்கள் Pass நன்மைகள் நிறுத்தப்பட்டுள்ளன. Google Play-இல் கட்டண முறையைச் சரிசெய்தால் அவை உடனே திரும்பும்.',
    },
    gu: {
      title: 'તમારો Aroha Pass અટકાવેલો છે',
      body: 'Google Play ચુકવણી લઈ શક્યું નહીં, તેથી તમારા Pass ના લાભો અટક્યા છે. Google Play માં ચુકવણી પદ્ધતિ સુધારો, લાભો તરત પાછા આવશે.',
    },
  },
  recovered: {
    en: {
      title: 'Your Aroha Pass is back',
      body: 'The payment went through. All your Pass benefits are on again.',
    },
    hi: {
      title: 'आपका Aroha Pass वापस चालू है',
      body: 'भुगतान हो गया। आपके Pass के सभी फ़ायदे फिर से चालू हैं।',
    },
    bn: {
      title: 'আপনার Aroha Pass আবার চালু',
      body: 'পেমেন্ট হয়ে গেছে। আপনার Pass-এর সব সুবিধা আবার চালু।',
    },
    mr: {
      title: 'तुमचा Aroha Pass पुन्हा सुरू झाला',
      body: 'पेमेंट झाले. तुमच्या Pass चे सर्व फायदे पुन्हा सुरू आहेत.',
    },
    te: {
      title: 'మీ Aroha Pass మళ్లీ ప్రారంభమైంది',
      body: 'చెల్లింపు పూర్తయింది. మీ Pass ప్రయోజనాలన్నీ మళ్లీ అందుబాటులో ఉన్నాయి.',
    },
    ta: {
      title: 'உங்கள் Aroha Pass மீண்டும் செயல்படுகிறது',
      body: 'கட்டணம் செலுத்தப்பட்டது. உங்கள் Pass நன்மைகள் அனைத்தும் மீண்டும் கிடைக்கின்றன.',
    },
    gu: {
      title: 'તમારો Aroha Pass ફરી ચાલુ છે',
      body: 'ચુકવણી થઈ ગઈ. તમારા Pass ના બધા લાભો ફરી ચાલુ છે.',
    },
  },
};

export function passNoticeCopy(
  notice: PassNotice,
  locale: string | null | undefined,
): { title: string; body: string } {
  return COPY[notice][normalizeLang(locale)];
}
