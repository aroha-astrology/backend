// =============================================================================
// Varshik Rashifal 2027 launch push: one notification to every user
// =============================================================================
// Sent by the owner from the admin routes (admin-varshik-launch.routes.ts): a preview of who it would
// reach, a try-out to the admin alone, then one confirmed send. Each user gets it once, in their own
// language (all 15 app languages). It is filed under Offers (marketing), so users who turned Offers off
// or are in quiet hours get it in the bell only. The report's name stays in English in every language,
// as in the launch pop-up and the report's own label. No AI or technology names (owner's rule).
// =============================================================================

import pLimit from 'p-limit';
import { logger } from '../../lib/logger.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { pushAllowedUserIds } from '../../lib/notifications/notification-prefs.js';
import { resolveAudience } from '../gift-campaigns/gift-campaigns.repo.js';
import { getAllActiveTokens } from '../device-tokens/device-tokens.repo.js';
import { listUserIdsNotified } from '../pass/pass.repo.js';

export const VARSHIK_LAUNCH_PUSH_TYPE = 'varshik_launch';
/** A try-out sent to the admin alone: it must not count as that admin's launch notification. */
export const VARSHIK_LAUNCH_PUSH_TEST_TYPE = 'varshik_launch_test';
/** The reports page, where the report is featured while the switches are on. */
export const VARSHIK_LAUNCH_PUSH_LINK = '/reports';
const SEND_CONCURRENCY = 10;

export interface LaunchCopy {
  title: string;
  body: string;
}

/** Hand-written. Check any change against the launch pop-up wording (frontend i18n/roadmap/varshik-launch.ts). */
export const VARSHIK_LAUNCH_PUSH_COPY: Record<string, LaunchCopy> = {
  en: {
    title: 'Varshik Rashifal 2027 is live',
    body: 'Your year ahead, month by month, read from your own birth chart. Open Reports to see it.',
  },
  hi: {
    title: 'Varshik Rashifal 2027 आ गया है',
    body: 'आपका आने वाला साल, महीने-दर-महीने, आपकी अपनी जन्म कुंडली से पढ़ा गया। देखने के लिए रिपोर्ट खोलें।',
  },
  bn: {
    title: 'Varshik Rashifal 2027 এসে গেছে',
    body: 'আপনার সামনের বছর, মাসে মাসে, আপনার নিজের জন্মকুণ্ডলী থেকে পড়া। দেখতে রিপোর্ট খুলুন।',
  },
  mr: {
    title: 'Varshik Rashifal 2027 आले आहे',
    body: 'तुमचे येणारे वर्ष, महिन्या-महिन्याने, तुमच्या स्वतःच्या जन्मकुंडलीतून वाचलेले. पाहण्यासाठी रिपोर्ट उघडा.',
  },
  te: {
    title: 'Varshik Rashifal 2027 వచ్చేసింది',
    body: 'మీ రాబోయే సంవత్సరం, నెల నెలా, మీ స్వంత జన్మ కుండలి నుండి చదివినది. చూడటానికి రిపోర్ట్స్ తెరవండి.',
  },
  ta: {
    title: 'Varshik Rashifal 2027 வந்துவிட்டது',
    body: 'உங்கள் வரவிருக்கும் ஆண்டு, மாதம் மாதமாக, உங்கள் சொந்த ஜாதகத்திலிருந்து படிக்கப்பட்டது. பார்க்க ரிப்போர்ட்ஸைத் திறக்கவும்.',
  },
  gu: {
    title: 'Varshik Rashifal 2027 આવી ગયું છે',
    body: 'તમારું આવનારું વર્ષ, મહિને મહિને, તમારી પોતાની જન્મકુંડળીમાંથી વાંચેલું. જોવા માટે રિપોર્ટ્સ ખોલો.',
  },
  kn: {
    title: 'Varshik Rashifal 2027 ಬಂದಿದೆ',
    body: 'ನಿಮ್ಮ ಮುಂದಿನ ವರ್ಷ, ತಿಂಗಳಿಂದ ತಿಂಗಳಿಗೆ, ನಿಮ್ಮದೇ ಜನ್ಮ ಕುಂಡಲಿಯಿಂದ ಓದಿದ್ದು. ನೋಡಲು ರಿಪೋರ್ಟ್ಸ್ ತೆರೆಯಿರಿ.',
  },
  es: {
    title: 'Varshik Rashifal 2027 ya está aquí',
    body: 'Tu año por delante, mes a mes, leído desde tu propia carta natal. Abre Informes para verlo.',
  },
  fr: {
    title: 'Varshik Rashifal 2027 est là',
    body: 'Votre année à venir, mois par mois, lue dans votre propre thème natal. Ouvrez Rapports pour la voir.',
  },
  de: {
    title: 'Varshik Rashifal 2027 ist da',
    body: 'Dein kommendes Jahr, Monat für Monat, gelesen aus deinem eigenen Geburtshoroskop. Öffne Berichte, um es zu sehen.',
  },
  it: {
    title: 'Varshik Rashifal 2027 è arrivato',
    body: 'Il tuo anno che verrà, mese per mese, letto dalla tua carta natale. Apri Rapporti per vederlo.',
  },
  pt: {
    title: 'Varshik Rashifal 2027 já chegou',
    body: 'O seu ano pela frente, mês a mês, lido a partir do seu próprio mapa de nascimento. Abra Relatórios para ver.',
  },
  ja: {
    title: 'Varshik Rashifal 2027 が登場',
    body: 'あなたの来年を、月ごとに、あなた自身の出生チャートから読み解きます。レポートを開いてご覧ください。',
  },
  ru: {
    title: 'Varshik Rashifal 2027 уже здесь',
    body: 'Ваш год впереди, месяц за месяцем, по вашей собственной натальной карте. Откройте «Отчёты», чтобы увидеть.',
  },
};

export function launchLang(locale: string | null | undefined): string {
  const base = (locale ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
  return base in VARSHIK_LAUNCH_PUSH_COPY ? base : 'en';
}

export function varshikLaunchCopy(locale: string | null | undefined): LaunchCopy {
  return VARSHIK_LAUNCH_PUSH_COPY[launchLang(locale)]!;
}

export interface VarshikLaunchPreview {
  /** Users who have not had this notification yet: each gets it in the bell. */
  eligibleCount: number;
  /** Of those, how many have a phone or browser that can receive a push now (Offers on, not in quiet hours). */
  pushableCount: number;
  /** Users an earlier send already reached. */
  alreadySentCount: number;
  byLanguage: Record<string, number>;
  copyEnglish: LaunchCopy;
}

async function dueAudience() {
  const [audience, sent] = await Promise.all([
    resolveAudience(null),
    listUserIdsNotified(VARSHIK_LAUNCH_PUSH_TYPE),
  ]);
  return { due: audience.filter((a) => !sent.has(a.userId)), total: audience.length };
}

export async function previewVarshikLaunch(): Promise<VarshikLaunchPreview> {
  const [{ due, total }, tokens] = await Promise.all([dueAudience(), getAllActiveTokens()]);
  const withToken = new Set(tokens.map((t) => t.userId));
  const dueWithToken = due.filter((d) => withToken.has(d.userId)).map((d) => d.userId);
  const allowed = await pushAllowedUserIds(dueWithToken, VARSHIK_LAUNCH_PUSH_TYPE);
  const byLanguage: Record<string, number> = {};
  for (const d of due) {
    const l = launchLang(d.locale);
    byLanguage[l] = (byLanguage[l] ?? 0) + 1;
  }
  return {
    eligibleCount: due.length,
    pushableCount: allowed.size,
    alreadySentCount: total - due.length,
    byLanguage,
    copyEnglish: VARSHIK_LAUNCH_PUSH_COPY.en!,
  };
}

/** The try-out: one user, in their language, as often as wanted. Not counted as that user's launch notification. */
export async function sendVarshikLaunchTest(user: { id: string; locale: string | null }): Promise<LaunchCopy> {
  const copy = varshikLaunchCopy(user.locale);
  await notifyUser(user.id, { ...copy, type: VARSHIK_LAUNCH_PUSH_TEST_TYPE, link: VARSHIK_LAUNCH_PUSH_LINK });
  return copy;
}

export interface VarshikLaunchSend {
  attempted: number;
  failed: number;
}

/** Sends to every user who has not had it. A second call reaches only the ones the first missed. */
export async function sendVarshikLaunch(): Promise<VarshikLaunchSend> {
  const { due } = await dueAudience();
  const limit = pLimit(SEND_CONCURRENCY);
  const results = await Promise.allSettled(
    due.map((member) =>
      limit(() =>
        notifyUser(member.userId, {
          ...varshikLaunchCopy(member.locale),
          type: VARSHIK_LAUNCH_PUSH_TYPE,
          link: VARSHIK_LAUNCH_PUSH_LINK,
        }),
      ),
    ),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) logger.error({ failed, total: due.length }, 'varshik-launch-push: some sends failed');
  return { attempted: due.length, failed };
}
