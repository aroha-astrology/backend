/**
 * Localized push-notification copy for gift campaigns. Same reasoning as
 * broadcast-copy.ts (FCM carries an already-rendered string — there's no
 * client-side render step), and reuses its LangCode/normalizeLang/
 * SUPPORTED_LANGS rather than redefining the 7-language set twice.
 *
 * Unlike broadcast-copy.ts's fixed per-day hooks, this is a template per
 * (language, delivery mode) that every campaign interpolates its own title
 * and amount into — one campaign, sent through here, needs no new copy.
 */
import { normalizeLang, SUPPORTED_LANGS, type LangCode } from '../cron/broadcast-copy.js';

export { normalizeLang, SUPPORTED_LANGS };
export type { LangCode };

export interface GiftPushCopy {
  title: string;
  body: string;
}

type CopyFn = (title: string, amount: string) => GiftPushCopy;

const SELF_CLAIM: Record<LangCode, CopyFn> = {
  en: (title, amount) => ({
    title: `${amount} for you 🎁`,
    body: `To celebrate ${title}, we've added a ${amount} gift to your Aroha wallet — open the app to claim it.`,
  }),
  hi: (title, amount) => ({
    title: `आपके लिए ${amount} 🎁`,
    body: `${title} के अवसर पर, आपके Aroha वॉलेट में ${amount} का तोहफ़ा जोड़ा गया है — ऐप खोलकर पाएं।`,
  }),
  bn: (title, amount) => ({
    title: `আপনার জন্য ${amount} 🎁`,
    body: `${title} উপলক্ষে, আপনার Aroha ওয়ালেটে ${amount} উপহার যোগ করা হয়েছে — অ্যাপ খুলে নিন।`,
  }),
  mr: (title, amount) => ({
    title: `तुमच्यासाठी ${amount} 🎁`,
    body: `${title} निमित्ताने, तुमच्या Aroha वॉलेटमध्ये ${amount} ची भेट जोडली आहे — अ‍ॅप उघडून मिळवा.`,
  }),
  te: (title, amount) => ({
    title: `మీ కోసం ${amount} 🎁`,
    body: `${title} సందర్భంగా, మీ Aroha వాలెట్‌కి ${amount} బహుమతి జోడించాము — యాప్ తెరిచి పొందండి.`,
  }),
  ta: (title, amount) => ({
    title: `உங்களுக்கு ${amount} 🎁`,
    body: `${title} முன்னிட்டு, உங்கள் Aroha வாலட்டில் ${amount} பரிசு சேர்க்கப்பட்டுள்ளது — ஆப்பைத் திறந்து பெறுங்கள்.`,
  }),
  gu: (title, amount) => ({
    title: `તમારા માટે ${amount} 🎁`,
    body: `${title} નિમિત્તે, તમારા Aroha વોલેટમાં ${amount} ની ભેટ ઉમેરાઈ છે — એપ ખોલીને મેળવો.`,
  }),
};

const AUTO_CREDIT: Record<LangCode, CopyFn> = {
  en: (title, amount) => ({
    title: `${amount} added to your wallet 🎁`,
    body: `Happy ${title}! We've added ${amount} to your Aroha wallet — no action needed.`,
  }),
  hi: (title, amount) => ({
    title: `${amount} आपके वॉलेट में जुड़ गए 🎁`,
    body: `${title} की शुभकामनाएं! आपके Aroha वॉलेट में ${amount} जोड़ दिए गए हैं — कुछ करने की ज़रूरत नहीं।`,
  }),
  bn: (title, amount) => ({
    title: `${amount} আপনার ওয়ালেটে যোগ হয়েছে 🎁`,
    body: `শুভ ${title}! আপনার Aroha ওয়ালেটে ${amount} যোগ করা হয়েছে — কিছু করার দরকার নেই।`,
  }),
  mr: (title, amount) => ({
    title: `${amount} तुमच्या वॉलेटमध्ये जोडले गेले 🎁`,
    body: `${title} च्या शुभेच्छा! तुमच्या Aroha वॉलेटमध्ये ${amount} जोडले आहेत — काही करण्याची गरज नाही.`,
  }),
  te: (title, amount) => ({
    title: `${amount} మీ వాలెట్‌కి జోడించబడింది 🎁`,
    body: `${title} శుభాకాంక్షలు! మీ Aroha వాలెట్‌కి ${amount} జోడించాము — ఏమీ చేయాల్సిన అవసరం లేదు.`,
  }),
  ta: (title, amount) => ({
    title: `${amount} உங்கள் வாலட்டில் சேர்க்கப்பட்டது 🎁`,
    body: `${title} வாழ்த்துக்கள்! உங்கள் Aroha வாலட்டில் ${amount} சேர்க்கப்பட்டுள்ளது — எதுவும் செய்ய வேண்டியதில்லை.`,
  }),
  gu: (title, amount) => ({
    title: `${amount} તમારા વોલેટમાં ઉમેરાયા 🎁`,
    body: `${title} ની શુભકામનાઓ! તમારા Aroha વોલેટમાં ${amount} ઉમેરાયા છે — કંઈ કરવાની જરૂર નથી.`,
  }),
};

export function getGiftCampaignPushCopy(
  lang: LangCode,
  deliveryMode: 'self_claim' | 'auto_credit',
  festivalTitle: string,
  amountRupeeLabel: string,
): GiftPushCopy {
  const table = deliveryMode === 'self_claim' ? SELF_CLAIM : AUTO_CREDIT;
  const fn = table[lang] ?? table.en;
  return fn(festivalTitle, amountRupeeLabel);
}
