import { getRedis } from '../../config/redis.js';
import { logger } from '../logger.js';
import { sendAlert } from './telegram.js';

/**
 * Operational alerting to Telegram, de-duplicated so a burst can't flood the
 * chat.
 *
 * The motivating incident: a misconfigured rate limiter rejected 194 requests
 * in two minutes. Un-throttled that is 194 messages — well past Telegram's
 * ~20/min per-chat ceiling, so the bot gets throttled and the alerts that
 * matter are the ones dropped. One message per problem, carrying the real
 * volume, is strictly more useful than 194 identical ones.
 */

/** How long a signature stays silent after firing. */
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Claim the window for a signature, atomically.
 *
 * `gate` is a TTL'd key: whoever SETs it first (NX) owns this window and
 * sends. Everyone else bumps `pending`, which survives the gate so the next
 * window's winner can report — and clear — the backlog. Single round trip so
 * two pm2 workers can't both decide they own the same window.
 */
const CLAIM_LUA = `
if redis.call('SET', KEYS[1], '1', 'NX', 'PX', ARGV[1]) then
  local suppressed = tonumber(redis.call('GET', KEYS[2]) or '0')
  redis.call('DEL', KEYS[2])
  return {1, suppressed}
end
redis.call('INCR', KEYS[2])
-- Outlive the gate so a backlog isn't lost between windows, but still expire
-- eventually rather than leaking a key per signature forever.
redis.call('PEXPIRE', KEYS[2], ARGV[2])
return {0, 0}
`;

/**
 * Send `title`/`message` to the ops chat, at most once per `signature` per
 * 15 minutes.
 *
 * Never throws and never rejects: alerting is observability, so a Redis
 * outage or a Telegram failure must not take down the request that triggered
 * it. Callers can `void` this safely.
 *
 * @param signature - Groups related events. Keep it low-cardinality (route +
 *   error kind, not a request id) or every event gets its own window and the
 *   throttle does nothing.
 */
export async function alertThrottled(
  signature: string,
  title: string,
  message: string,
): Promise<void> {
  try {
    const redis = getRedis();
    const [claimed, suppressed] = (await redis.eval(
      CLAIM_LUA,
      2,
      `alert:gate:${signature}`,
      `alert:pending:${signature}`,
      WINDOW_MS,
      WINDOW_MS * 4,
    )) as [number, number];

    if (claimed !== 1) return;

    const suffix =
      suppressed > 0
        ? `\n\n(+${suppressed} more suppressed in the last ${WINDOW_MS / 60000} min)`
        : '';
    await sendAlert(title, `${message}${suffix}`);
  } catch (err) {
    logger.warn({ err, signature }, 'alertThrottled failed');
  }
}

/** Test seam — no module-level state today, kept so specs can reset cleanly. */
export function __resetForTests(): void {
  /* no-op */
}
