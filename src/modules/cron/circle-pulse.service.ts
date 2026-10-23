// =============================================================================
// Cosmic Circles — the daily pulse run
// =============================================================================
// Meant to run every hour. For each owner whose local clock is in the morning window it makes sure
// every circle member has today's pulse (so the screen opens instantly), and, when `circles.pulse`
// is on for them, sends ONE push for the member whose day stands out most (a bright day or a day to
// go gently). A pulse is marked as pushed before the push goes out, so a retried run never repeats
// it. Quiet hours and the notification settings are applied by notifyUser. The copy is in the owner's
// language (15 languages with lang.pushAll on, the original 7 otherwise).
// =============================================================================

import { logger } from '../../lib/logger.js';
import { acquire, release } from '../../lib/cache/locks.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { dateInZone, userZone } from '../../lib/user-time-zone.js';
import { isFeatureOn, isFeatureOnGlobally } from '../features/features.service.js';
import { findActiveUserById } from '../users/users.repo.js';
import { ensurePulses, getCircle } from '../circles/circles.service.js';
import { anyNotified, listMembers, markPulseNotified, ownersWithMembers } from '../circles/circles.repo.js';
import type { PulseTone } from '../circles/circles-rules.js';
import { localClock } from '../widgets/live-now.js';
import { normalizePushLang, type PushLang } from '../../lib/push-lang.js';
import { circlePulsePush } from '../../lib/push-copy/sprint4-copy.js';

export const CIRCLE_PULSE_NOTIFICATION_TYPE = 'circle_pulse';

/** Local hours (inclusive start, exclusive end) in which a circle's pulse is prepared and pushed. */
export const PULSE_WINDOW = { startHour: 7, endHour: 11 } as const;

export interface CirclePulseResult {
  skipped: boolean;
  reason?: string;
  owners: number;
  pulsesReady: number;
  pushed: number;
}

/** The member whose day stands out: the brightest at 70 or more, else the lowest under 38; none otherwise. */
export function notablePulse<T extends { score: number }>(pulses: T[]): T | null {
  if (pulses.length === 0) return null;
  const best = pulses.reduce((a, b) => (b.score > a.score ? b : a));
  if (best.score >= 70) return best;
  const worst = pulses.reduce((a, b) => (b.score < a.score ? b : a));
  return worst.score < 38 ? worst : null;
}

export function pulseCopy(name: string, tone: PulseTone, lang: PushLang = 'en'): { title: string; body: string } {
  return circlePulsePush(lang, name, tone);
}

export async function runCirclePulse(
  opts: { now?: Date; dryRun?: boolean; limit?: number } = {},
): Promise<CirclePulseResult> {
  const now = opts.now ?? new Date();
  const empty = { owners: 0, pulsesReady: 0, pushed: 0 };

  if (!(await isFeatureOnGlobally('circles.circles'))) return { skipped: true, reason: 'off', ...empty };

  const hourKey = now.toISOString().slice(0, 13);
  const lock = await acquire('circle-pulse', hourKey, 600);
  if (!lock.ok) return { skipped: true, reason: 'already-running', ...empty };

  const result: CirclePulseResult = { skipped: false, ...empty };
  const allLanguages = await isFeatureOnGlobally('lang.pushAll').catch(() => false);
  try {
    for (const ownerId of await ownersWithMembers(opts.limit ?? 500)) {
      try {
        const owner = await findActiveUserById(ownerId);
        if (!owner || !(await isFeatureOn(owner.id, 'circles.circles'))) continue;

        const zone = userZone(owner.currentTimezone);
        const { minutes } = localClock(now, zone);
        const hour = Math.floor(minutes / 60);
        if (hour < PULSE_WINDOW.startHour || hour >= PULSE_WINDOW.endHour) continue;

        result.owners++;
        const localDate = dateInZone(now, zone);
        const members = await listMembers(owner.id);
        if (opts.dryRun) continue;
        const pulses = await ensurePulses(owner, members, localDate, now);
        result.pulsesReady += [...pulses.values()].filter(Boolean).length;

        if (!(await isFeatureOn(owner.id, 'circles.pulse'))) continue;
        if (await anyNotified(members.map((m) => m.id), localDate)) continue;

        const scored = members.flatMap((m) => {
          const p = pulses.get(m.id);
          return p ? [{ member: m, score: p.score, tone: p.tone }] : [];
        });
        const pick = notablePulse(scored);
        if (!pick) continue;
        if (!(await markPulseNotified(pick.member.id, localDate))) continue;

        const circle = await getCircle(owner, now);
        const name = circle.members.find((m) => m.id === pick.member.id)?.name ?? 'Someone dear';
        const copy = pulseCopy(name, pick.tone, normalizePushLang(owner.locale, allLanguages));
        await notifyUser(owner.id, {
          title: copy.title,
          body: copy.body,
          type: CIRCLE_PULSE_NOTIFICATION_TYPE,
          link: '/circles',
        });
        result.pushed++;
      } catch (err) {
        logger.warn({ err, ownerId }, 'circle-pulse: owner skipped');
      }
    }
  } finally {
    await release('circle-pulse', hourKey, lock.owner).catch(() => {});
  }
  return result;
}
