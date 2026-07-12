import { getAllActiveTokens } from '../device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import { logger } from '../../lib/logger.js';

/** App timezone — same as horoscope.service.ts */
const APP_TZ = 'Asia/Kolkata';

/**
 * 7 eye-catching daily hooks — one per weekday (0 = Sunday … 6 = Saturday).
 * The title is punchy enough to stop a thumb-scroll; the body gives a
 * personalised-feeling tease without revealing content (so they *have* to open).
 */
const DAILY_HOOKS: { title: string; body: string }[] = [
  // Sunday (0)
  {
    title: '🌅 The cosmos greets you',
    body: 'A rare planetary alignment shapes today. Your Vedic reading holds the key — open before the window passes.',
  },
  // Monday (1)
  {
    title: '🌙 Luna has a message for you',
    body: "The Moon moves signs today and it's personal. Tap to see how today's energy lands on your chart.",
  },
  // Tuesday (2)
  {
    title: '🔥 Mars is watching your next move',
    body: 'Bold choices pay off — but only if you know which battles to pick. Your reading reveals today\'s cosmic edge.',
  },
  // Wednesday (3)
  {
    title: '✨ Mercury speaks — are you listening?',
    body: "Words, deals & decisions carry extra weight today. Don't start your day without knowing what the stars say.",
  },
  // Thursday (4)
  {
    title: '🪐 Jupiter opens a door today',
    body: 'Expansion is in the air. Your Vedic horoscope shows exactly where to direct your energy for maximum flow.',
  },
  // Friday (5)
  {
    title: '💫 Your cosmic forecast is here',
    body: "Venus blesses the day — but for whom? Tap to find out if fortune smiles on your love, wealth or career today.",
  },
  // Saturday (6)
  {
    title: '🔮 The stars have spoken for you',
    body: "Saturday's skies carry a hidden twist. Read your personalised Aroha horoscope before the day unfolds.",
  },
];

/** Day-of-week (0–6) in IST right now. */
function dayOfWeekIST(): number {
  const now = new Date();
  const istDateStr = now.toLocaleDateString('en-US', {
    timeZone: APP_TZ,
    weekday: 'short',
  });
  // Map English short weekday back to 0-indexed (Sun=0 … Sat=6)
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[istDateStr] ?? new Date().getUTCDay();
}

export interface BroadcastDailyReadingResult {
  hook: string;
  tokensFound: number;
  success: number;
  failure: number;
}

/**
 * Broadcast "Today's Reading is Ready" to every active (unrevoked, push-enabled)
 * device token. Uses a rotating set of 7 Vedic-themed hooks so the copy is
 * different every day of the week.
 *
 * Called by the /cron/broadcast-daily-reading endpoint, wired to 01:30 UTC
 * (= 07:00 IST) on the EC2 crontab — well after the 00:01 IST horoscope
 * generation run, so readings are always ready before the ping lands.
 *
 * Never throws — a total FCM failure must not crash the cron job.
 */
export async function broadcastDailyReading(): Promise<BroadcastDailyReadingResult> {
  const dow = dayOfWeekIST();
  const hook = DAILY_HOOKS[dow] ?? DAILY_HOOKS[0]!;

  logger.info({ dow, title: hook.title }, 'broadcast:daily-reading start');

  let tokens: Awaited<ReturnType<typeof getAllActiveTokens>>;
  try {
    tokens = await getAllActiveTokens();
  } catch (err) {
    logger.error({ err }, 'broadcast:daily-reading failed to fetch tokens');
    return { hook: hook.title, tokensFound: 0, success: 0, failure: 0 };
  }

  if (tokens.length === 0) {
    logger.info('broadcast:daily-reading no active tokens — nothing to send');
    return { hook: hook.title, tokensFound: 0, success: 0, failure: 0 };
  }

  const tokenStrings = tokens.map((t) => t.token);

  // FCM sendEach supports up to 500 tokens per call; sendPushBatch wraps it
  // in a single messaging.sendEach() which handles the batching internally.
  const { success, failure } = await sendPushBatch(
    tokenStrings,
    hook.title,
    hook.body,
    { type: 'daily_reading', navigate: '/horoscope' },
  );

  logger.info(
    { dow, tokensFound: tokens.length, success, failure, title: hook.title },
    'broadcast:daily-reading done',
  );

  return { hook: hook.title, tokensFound: tokens.length, success, failure };
}
