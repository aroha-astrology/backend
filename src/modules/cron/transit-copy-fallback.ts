/**
 * Hand-written fallback push copy for transit pre-alerts, used when Gemini
 * fails or its output fails validation (see validateTransitCopy).
 *
 * This exists so that a bad generation degrades to a plain, true, boring
 * notification rather than either silence or something unvetted. It is
 * deliberately generic — no Moon sign, no house — because the situations that
 * land here are exactly the ones where we cannot trust generated specifics.
 *
 * Authored server-side rather than via the frontend's i18n resources, for the
 * same reason as broadcast-copy.ts: FCM carries an already-rendered string and
 * there is no client-side render step for a push notification.
 *
 * `{planet}` and `{sign}` are substituted from the event. Planet and sign names
 * are localized via PLANET_NAMES / SIGN_NAMES below rather than interpolated in
 * English — a Bengali notification reading "শনি" must not say "Saturn".
 */

import type { LangCode } from './broadcast-copy.js';
import type { TransitEventType } from '../../lib/astro-tools/transit-events.js';

export interface PushCopy {
  title: string;
  body: string;
}

/** Localized planet names, keyed by the engine's English planet name. */
export const PLANET_NAMES: Record<LangCode, Record<string, string>> = {
  en: {
    Sun: 'The Sun',
    Mercury: 'Mercury',
    Venus: 'Venus',
    Mars: 'Mars',
    Jupiter: 'Jupiter',
    Saturn: 'Saturn',
    Rahu: 'Rahu',
    Ketu: 'Ketu',
  },
  hi: {
    Sun: 'सूर्य',
    Mercury: 'बुध',
    Venus: 'शुक्र',
    Mars: 'मंगल',
    Jupiter: 'बृहस्पति',
    Saturn: 'शनि',
    Rahu: 'राहु',
    Ketu: 'केतु',
  },
  bn: {
    Sun: 'সূর্য',
    Mercury: 'বুধ',
    Venus: 'শুক্র',
    Mars: 'মঙ্গল',
    Jupiter: 'বৃহস্পতি',
    Saturn: 'শনি',
    Rahu: 'রাহু',
    Ketu: 'কেতু',
  },
  mr: {
    Sun: 'सूर्य',
    Mercury: 'बुध',
    Venus: 'शुक्र',
    Mars: 'मंगळ',
    Jupiter: 'गुरू',
    Saturn: 'शनि',
    Rahu: 'राहू',
    Ketu: 'केतू',
  },
  te: {
    Sun: 'సూర్యుడు',
    Mercury: 'బుధుడు',
    Venus: 'శుక్రుడు',
    Mars: 'కుజుడు',
    Jupiter: 'గురువు',
    Saturn: 'శని',
    Rahu: 'రాహువు',
    Ketu: 'కేతువు',
  },
  ta: {
    Sun: 'சூரியன்',
    Mercury: 'புதன்',
    Venus: 'சுக்கிரன்',
    Mars: 'செவ்வாய்',
    Jupiter: 'குரு',
    Saturn: 'சனி',
    Rahu: 'ராகு',
    Ketu: 'கேது',
  },
  gu: {
    Sun: 'સૂર્ય',
    Mercury: 'બુધ',
    Venus: 'શુક્ર',
    Mars: 'મંગળ',
    Jupiter: 'ગુરુ',
    Saturn: 'શનિ',
    Rahu: 'રાહુ',
    Ketu: 'કેતુ',
  },
};

/** Localized zodiac sign names, keyed by the engine's English sign name. */
export const SIGN_NAMES: Record<LangCode, Record<string, string>> = {
  en: {
    Aries: 'Aries',
    Taurus: 'Taurus',
    Gemini: 'Gemini',
    Cancer: 'Cancer',
    Leo: 'Leo',
    Virgo: 'Virgo',
    Libra: 'Libra',
    Scorpio: 'Scorpio',
    Sagittarius: 'Sagittarius',
    Capricorn: 'Capricorn',
    Aquarius: 'Aquarius',
    Pisces: 'Pisces',
  },
  hi: {
    Aries: 'मेष',
    Taurus: 'वृषभ',
    Gemini: 'मिथुन',
    Cancer: 'कर्क',
    Leo: 'सिंह',
    Virgo: 'कन्या',
    Libra: 'तुला',
    Scorpio: 'वृश्चिक',
    Sagittarius: 'धनु',
    Capricorn: 'मकर',
    Aquarius: 'कुंभ',
    Pisces: 'मीन',
  },
  bn: {
    Aries: 'মেষ',
    Taurus: 'বৃষ',
    Gemini: 'মিথুন',
    Cancer: 'কর্কট',
    Leo: 'সিংহ',
    Virgo: 'কন্যা',
    Libra: 'তুলা',
    Scorpio: 'বৃশ্চিক',
    Sagittarius: 'ধনু',
    Capricorn: 'মকর',
    Aquarius: 'কুম্ভ',
    Pisces: 'মীন',
  },
  mr: {
    Aries: 'मेष',
    Taurus: 'वृषभ',
    Gemini: 'मिथुन',
    Cancer: 'कर्क',
    Leo: 'सिंह',
    Virgo: 'कन्या',
    Libra: 'तूळ',
    Scorpio: 'वृश्चिक',
    Sagittarius: 'धनु',
    Capricorn: 'मकर',
    Aquarius: 'कुंभ',
    Pisces: 'मीन',
  },
  te: {
    Aries: 'మేషం',
    Taurus: 'వృషభం',
    Gemini: 'మిథునం',
    Cancer: 'కర్కాటకం',
    Leo: 'సింహం',
    Virgo: 'కన్య',
    Libra: 'తుల',
    Scorpio: 'వృశ్చికం',
    Sagittarius: 'ధనుస్సు',
    Capricorn: 'మకరం',
    Aquarius: 'కుంభం',
    Pisces: 'మీనం',
  },
  ta: {
    Aries: 'மேஷம்',
    Taurus: 'ரிஷபம்',
    Gemini: 'மிதுனம்',
    Cancer: 'கடகம்',
    Leo: 'சிம்மம்',
    Virgo: 'கன்னி',
    Libra: 'துலாம்',
    Scorpio: 'விருச்சிகம்',
    Sagittarius: 'தனுசு',
    Capricorn: 'மகரம்',
    Aquarius: 'கும்பம்',
    Pisces: 'மீனம்',
  },
  gu: {
    Aries: 'મેષ',
    Taurus: 'વૃષભ',
    Gemini: 'મિથુન',
    Cancer: 'કર્ક',
    Leo: 'સિંહ',
    Virgo: 'કન્યા',
    Libra: 'તુલા',
    Scorpio: 'વૃશ્ચિક',
    Sagittarius: 'ધનુ',
    Capricorn: 'મકર',
    Aquarius: 'કુંભ',
    Pisces: 'મીન',
  },
};

type FallbackTemplate = { title: string; body: string };

const FALLBACK: Record<TransitEventType, Record<LangCode, FallbackTemplate>> = {
  ingress: {
    en: {
      title: '🪐 {planet} changes sign in 2 days',
      body: '{planet} moves into {sign} on {date}. Open Aroha to see which part of your chart it lands on.',
    },
    hi: {
      title: '🪐 2 दिन में {planet} राशि बदल रहे हैं',
      body: '{date} को {planet} {sign} में प्रवेश कर रहे हैं। देखें यह आपकी कुंडली के किस भाव पर पड़ता है।',
    },
    bn: {
      title: '🪐 ২ দিনে {planet} রাশি বদলাচ্ছে',
      body: '{date} তারিখে {planet} {sign}-এ প্রবেশ করছে। দেখুন এটি আপনার কুণ্ডলীর কোন ঘরে পড়ে।',
    },
    mr: {
      title: '🪐 2 दिवसांत {planet} राशी बदलत आहे',
      body: '{date} रोजी {planet} {sign} मध्ये प्रवेश करत आहे. पाहा हे तुमच्या कुंडलीच्या कोणत्या स्थानावर येते.',
    },
    te: {
      title: '🪐 2 రోజుల్లో {planet} రాశి మారుతోంది',
      body: '{date}న {planet} {sign}లోకి ప్రవేశిస్తోంది. ఇది మీ జాతకంలో ఏ భావంలో పడుతుందో చూడండి.',
    },
    ta: {
      title: '🪐 2 நாட்களில் {planet} ராசி மாறுகிறது',
      body: '{date} அன்று {planet} {sign} ராசிக்கு மாறுகிறது. இது உங்கள் ஜாதகத்தில் எந்த வீட்டில் விழுகிறது எனப் பாருங்கள்.',
    },
    gu: {
      title: '🪐 2 દિવસમાં {planet} રાશિ બદલે છે',
      body: '{date}ના રોજ {planet} {sign}માં પ્રવેશ કરે છે. જુઓ કે તે તમારી કુંડળીના કયા ભાવમાં આવે છે.',
    },
  },
  retrograde: {
    en: {
      title: '↩️ {planet} turns retrograde in 2 days',
      body: '{planet} goes retrograde in {sign} on {date}. Open Aroha to see what to hold off on.',
    },
    hi: {
      title: '↩️ 2 दिन में {planet} वक्री हो रहे हैं',
      body: '{date} को {planet} {sign} में वक्री हो रहे हैं। देखें अभी किन कामों को टालना बेहतर है।',
    },
    bn: {
      title: '↩️ ২ দিনে {planet} বক্রী হচ্ছে',
      body: '{date} তারিখে {planet} {sign}-এ বক্রী হচ্ছে। দেখুন এখন কোন কাজ পিছিয়ে দেওয়া ভালো।',
    },
    mr: {
      title: '↩️ 2 दिवसांत {planet} वक्री होत आहे',
      body: '{date} रोजी {planet} {sign} मध्ये वक्री होत आहे. पाहा आत्ता कोणती कामे पुढे ढकलावीत.',
    },
    te: {
      title: '↩️ 2 రోజుల్లో {planet} వక్రించనుంది',
      body: '{date}న {planet} {sign}లో వక్రిస్తోంది. ఇప్పుడు ఏ పనులు వాయిదా వేయాలో చూడండి.',
    },
    ta: {
      title: '↩️ 2 நாட்களில் {planet} வக்ரமாகிறது',
      body: '{date} அன்று {planet} {sign}இல் வக்ரமாகிறது. இப்போது எதைத் தள்ளிப்போட வேண்டும் எனப் பாருங்கள்.',
    },
    gu: {
      title: '↩️ 2 દિવસમાં {planet} વક્રી થાય છે',
      body: '{date}ના રોજ {planet} {sign}માં વક્રી થાય છે. જુઓ અત્યારે કયાં કામ મુલતવી રાખવાં.',
    },
  },
  direct: {
    en: {
      title: '▶️ {planet} turns direct in 2 days',
      body: '{planet} goes direct in {sign} on {date}. Open Aroha to see what starts moving again.',
    },
    hi: {
      title: '▶️ 2 दिन में {planet} मार्गी हो रहे हैं',
      body: '{date} को {planet} {sign} में मार्गी हो रहे हैं। देखें अब कौन से काम फिर से गति पकड़ेंगे।',
    },
    bn: {
      title: '▶️ ২ দিনে {planet} মার্গী হচ্ছে',
      body: '{date} তারিখে {planet} {sign}-এ মার্গী হচ্ছে। দেখুন এখন কোন কাজ আবার এগোতে শুরু করবে।',
    },
    mr: {
      title: '▶️ 2 दिवसांत {planet} मार्गी होत आहे',
      body: '{date} रोजी {planet} {sign} मध्ये मार्गी होत आहे. पाहा आता कोणती कामे पुन्हा गती घेतील.',
    },
    te: {
      title: '▶️ 2 రోజుల్లో {planet} మార్గి అవుతోంది',
      body: '{date}న {planet} {sign}లో మార్గి అవుతోంది. ఇప్పుడు ఏ పనులు మళ్లీ కదులుతాయో చూడండి.',
    },
    ta: {
      title: '▶️ 2 நாட்களில் {planet} நேர்பாதைக்கு வருகிறது',
      body: '{date} அன்று {planet} {sign}இல் நேர்பாதைக்கு வருகிறது. எது மீண்டும் நகரத் தொடங்கும் எனப் பாருங்கள்.',
    },
    gu: {
      title: '▶️ 2 દિવસમાં {planet} માર્ગી થાય છે',
      body: '{date}ના રોજ {planet} {sign}માં માર્ગી થાય છે. જુઓ હવે કયાં કામ ફરી ગતિ પકડશે.',
    },
  },
};

/** Localized day-and-month, e.g. "26 July" / "২৬ জুলাই", from a YYYY-MM-DD IST date. */
function formatEventDate(forDate: string, lang: LangCode): string {
  // Parse as UTC and format in UTC: forDate is already the IST calendar date,
  // so re-projecting it through a timezone would shift it back off by a day.
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-IN' : lang, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${forDate}T00:00:00Z`));
}

/**
 * Render the static fallback copy for an event in one language.
 *
 * `sign` is the sign the event happens in — the entered sign for an ingress,
 * the standing sign for a station.
 */
export function getFallbackCopy(
  eventType: TransitEventType,
  planet: string,
  sign: string,
  forDate: string,
  lang: LangCode,
): PushCopy {
  const template = FALLBACK[eventType][lang];
  const planetName = PLANET_NAMES[lang][planet] ?? planet;
  const signName = SIGN_NAMES[lang][sign] ?? sign;
  const dateName = formatEventDate(forDate, lang);

  const fill = (s: string) =>
    s
      .replaceAll('{planet}', planetName)
      .replaceAll('{sign}', signName)
      .replaceAll('{date}', dateName);

  return { title: fill(template.title), body: fill(template.body) };
}
