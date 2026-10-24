// =============================================================================
// What a user is told when Google refunds a purchase and the app takes back
// what it gave (play-refunds.service.ts). In the user's language, like the
// Pass notices; every notice opens the payment history.
// =============================================================================

import { normalizeLang, type LangCode } from '../cron/broadcast-copy.js';

/** 'wallet': money taken back, nothing owed. 'debt': the wallet is now below zero. 'questions': a pack. */
export type PlayRefundNotice = 'wallet' | 'debt' | 'questions';

type Copy = { title: string; body: string };

// {amount} = what was taken back, {balance} = the wallet now, {count} = questions.
const COPY: Record<PlayRefundNotice, Record<LangCode, Copy>> = {
  wallet: {
    en: {
      title: 'Your Google Play refund',
      body: 'Google Play refunded your {amount} payment, so {amount} was taken back from your wallet.',
    },
    hi: {
      title: 'आपका Google Play रिफ़ंड',
      body: 'Google Play ने आपका {amount} का भुगतान लौटा दिया, इसलिए आपके वॉलेट से {amount} वापस ले लिए गए।',
    },
    bn: {
      title: 'আপনার Google Play রিফান্ড',
      body: 'Google Play আপনার {amount}-এর পেমেন্ট ফেরত দিয়েছে, তাই আপনার ওয়ালেট থেকে {amount} ফেরত নেওয়া হয়েছে।',
    },
    mr: {
      title: 'तुमचा Google Play परतावा',
      body: 'Google Play ने तुमचे {amount} चे पेमेंट परत केले, म्हणून तुमच्या वॉलेटमधून {amount} परत घेतले गेले.',
    },
    te: {
      title: 'మీ Google Play రీఫండ్',
      body: 'Google Play మీ {amount} చెల్లింపును తిరిగి ఇచ్చింది, అందుకే మీ వాలెట్ నుండి {amount} తిరిగి తీసుకోబడింది.',
    },
    ta: {
      title: 'உங்கள் Google Play பணத்திரும்பல்',
      body: 'Google Play உங்கள் {amount} கட்டணத்தைத் திருப்பிக் கொடுத்தது, அதனால் உங்கள் வாலட்டிலிருந்து {amount} திரும்ப எடுக்கப்பட்டது.',
    },
    gu: {
      title: 'તમારું Google Play રિફંડ',
      body: 'Google Play એ તમારી {amount} ની ચુકવણી પરત કરી, તેથી તમારા વૉલેટમાંથી {amount} પાછા લેવાયા.',
    },
  },
  debt: {
    en: {
      title: 'Your Google Play refund',
      body: 'Google Play refunded your {amount} payment, but it was already spent, so your wallet is now {balance}. Rewards and recharges pay this off first. Reports bought with that money open again once it is paid.',
    },
    hi: {
      title: 'आपका Google Play रिफ़ंड',
      body: 'Google Play ने आपका {amount} का भुगतान लौटा दिया, पर वह पैसा खर्च हो चुका था, इसलिए आपका वॉलेट अब {balance} है। इनाम और रिचार्ज पहले इसे चुकाएँगे। उस पैसे से ली गई रिपोर्ट इसके चुकते ही फिर खुल जाएँगी।',
    },
    bn: {
      title: 'আপনার Google Play রিফান্ড',
      body: 'Google Play আপনার {amount}-এর পেমেন্ট ফেরত দিয়েছে, কিন্তু টাকাটা আগেই খরচ হয়ে গিয়েছিল, তাই আপনার ওয়ালেট এখন {balance}। পুরস্কার আর রিচার্জ আগে এটা শোধ করবে। ওই টাকায় কেনা রিপোর্ট শোধ হলেই আবার খুলবে।',
    },
    mr: {
      title: 'तुमचा Google Play परतावा',
      body: 'Google Play ने तुमचे {amount} चे पेमेंट परत केले, पण ते पैसे आधीच खर्च झाले होते, म्हणून तुमचे वॉलेट आता {balance} आहे. बक्षिसे आणि रिचार्ज आधी हे फेडतील. त्या पैशांनी घेतलेले अहवाल हे फिटताच पुन्हा उघडतील.',
    },
    te: {
      title: 'మీ Google Play రీఫండ్',
      body: 'Google Play మీ {amount} చెల్లింపును తిరిగి ఇచ్చింది, కానీ ఆ డబ్బు ఇప్పటికే ఖర్చయింది, అందుకే మీ వాలెట్ ఇప్పుడు {balance}. బహుమతులు, రీఛార్జ్‌లు ముందుగా దీన్ని తీరుస్తాయి. ఆ డబ్బుతో కొన్న రిపోర్టులు ఇది తీరగానే మళ్లీ తెరుచుకుంటాయి.',
    },
    ta: {
      title: 'உங்கள் Google Play பணத்திரும்பல்',
      body: 'Google Play உங்கள் {amount} கட்டணத்தைத் திருப்பிக் கொடுத்தது, ஆனால் அந்தப் பணம் ஏற்கெனவே செலவாகிவிட்டது, அதனால் உங்கள் வாலட் இப்போது {balance}. வெகுமதிகளும் ரீசார்ஜ்களும் முதலில் இதைச் சரிசெய்யும். அந்தப் பணத்தில் வாங்கிய அறிக்கைகள் இது சரியானதும் மீண்டும் திறக்கும்.',
    },
    gu: {
      title: 'તમારું Google Play રિફંડ',
      body: 'Google Play એ તમારી {amount} ની ચુકવણી પરત કરી, પણ તે પૈસા પહેલેથી વપરાઈ ગયા હતા, તેથી તમારું વૉલેટ હવે {balance} છે. ઇનામ અને રિચાર્જ પહેલાં આ ચૂકવશે. તે પૈસાથી લીધેલા રિપોર્ટ આ ચૂકવાતાં જ ફરી ખૂલશે.',
    },
  },
  questions: {
    en: {
      title: 'Your Google Play refund',
      body: 'Google Play refunded your Question Pack, so its {count} questions were taken back.',
    },
    hi: {
      title: 'आपका Google Play रिफ़ंड',
      body: 'Google Play ने आपका Question Pack लौटा दिया, इसलिए उसके {count} सवाल वापस ले लिए गए।',
    },
    bn: {
      title: 'আপনার Google Play রিফান্ড',
      body: 'Google Play আপনার Question Pack ফেরত দিয়েছে, তাই তার {count}টি প্রশ্ন ফেরত নেওয়া হয়েছে।',
    },
    mr: {
      title: 'तुमचा Google Play परतावा',
      body: 'Google Play ने तुमचा Question Pack परत केला, म्हणून त्याचे {count} प्रश्न परत घेतले गेले.',
    },
    te: {
      title: 'మీ Google Play రీఫండ్',
      body: 'Google Play మీ Question Packను తిరిగి ఇచ్చింది, అందుకే దాని {count} ప్రశ్నలు తిరిగి తీసుకోబడ్డాయి.',
    },
    ta: {
      title: 'உங்கள் Google Play பணத்திரும்பல்',
      body: 'Google Play உங்கள் Question Pack-ஐத் திருப்பிக் கொடுத்தது, அதனால் அதன் {count} கேள்விகள் திரும்ப எடுக்கப்பட்டன.',
    },
    gu: {
      title: 'તમારું Google Play રિફંડ',
      body: 'Google Play એ તમારો Question Pack પરત કર્યો, તેથી તેના {count} પ્રશ્નો પાછા લેવાયા.',
    },
  },
};

/** "₹100", "₹49.50", "−₹94.10". */
export function formatPaise(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  return `${paise < 0 ? '−' : ''}₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}

export function playRefundNoticeCopy(
  notice: PlayRefundNotice,
  locale: string | null | undefined,
  values: { amountPaise: number; balancePaise: number; questions: number },
): Copy {
  const copy = COPY[notice][normalizeLang(locale)];
  const fill = (text: string) =>
    text
      .replaceAll('{amount}', formatPaise(values.amountPaise))
      .replaceAll('{balance}', formatPaise(values.balancePaise))
      .replaceAll('{count}', String(values.questions));
  return { title: fill(copy.title), body: fill(copy.body) };
}
