// =============================================================================
// Fact-based re-engagement nudge — send
// =============================================================================
// Runs off the 1st/3rd-Sunday-of-the-month, 11:30 IST cron slot. Every user
// with at least one saved user_facts row (and no fact-nudge in the last
// FACT_NUDGE_MIN_GAP_DAYS) is a candidate for a nudge built around a dated
// window the assistant already committed to, or an unanswered follow-up
// question — opened by a real, currently-active planetary transit in that
// reader's own chart that actually matches the fact's topic. No matching
// fact, or no matching transit right now, means silence — for most users
// most cycles, nothing at all. See lib/llm/fact-nudge.ts for the
// selection/transit-matching/denylist/copy logic this orchestrates.
// =============================================================================

import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { acquire, release } from '../../lib/cache/locks.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { istDateString } from '../../lib/astro-tools/transit-events.js';
import { getUserFacts } from '../astro/user-facts.repo.js';
import {
  generateFactNudgeCopy,
  getFactNudgeFallback,
  isNudgeSunday,
  matchTransitForPick,
  pickNudgeFact,
  type FactNudgeCopy,
} from '../../lib/llm/fact-nudge.js';
import { normalizeLang } from './broadcast-copy.js';
import {
  FACT_NUDGE_NOTIFICATION_TYPE,
  getCurrentPlanetSigns,
  listFactNudgeCandidates,
} from './fact-nudge.repo.js';

export interface FactNudgeResult {
  skipped: boolean;
  reason?: string;
  candidates: number;
  /** Candidates with nothing safe/dated worth saying this cycle — expected to be common, not an error. */
  silent: number;
  sent: number;
  fallbacks: number;
}

const EMPTY: Omit<FactNudgeResult, 'skipped' | 'reason'> = {
  candidates: 0,
  silent: 0,
  sent: 0,
  fallbacks: 0,
};

/**
 * `force` skips the Sunday gate (for manual/test runs). `dryRun` resolves
 * every candidate's pick and drafts copy without sending anything or
 * writing an inbox row — for inspecting a batch before it goes out.
 */
export async function runFactNudge(
  opts: { force?: boolean; dryRun?: boolean; now?: Date } = {},
): Promise<FactNudgeResult> {
  const now = opts.now ?? new Date();

  if (!env.FACT_NUDGE_ENABLED) {
    logger.info('fact-nudge: disabled via FACT_NUDGE_ENABLED');
    return { skipped: true, reason: 'disabled', ...EMPTY };
  }

  if (!opts.force && !isNudgeSunday(now)) {
    logger.info({ now: now.toISOString() }, 'fact-nudge: skipped — not a 1st/3rd Sunday');
    return { skipped: true, reason: 'not-nudge-sunday', ...EMPTY };
  }

  const dateStr = istDateString(now);

  // Same reasoning as transit-alert.service.ts's send lock: a retried or
  // overlapping cron firing must be a no-op, not a duplicate send, and this
  // job is unrecallable once notifyUser has pushed.
  const lock = await acquire('fact-nudge-send', dateStr, 600);
  if (!lock.ok) {
    logger.info({ dateStr, reason: lock.reason }, 'fact-nudge: skipped — send already in flight');
    return { skipped: true, reason: 'locked', ...EMPTY };
  }

  try {
    const candidates = await listFactNudgeCandidates();
    // Global, not per-user — every candidate is matched against the same
    // sky, only the natal Moon sign (per candidate) differs.
    const currentSigns = await getCurrentPlanetSigns(now);
    logger.info(
      { dateStr, candidates: candidates.length, dryRun: opts.dryRun ?? false },
      'fact-nudge: start',
    );

    let silent = 0;
    let sent = 0;
    let fallbacks = 0;

    for (const candidate of candidates) {
      const facts = await getUserFacts(candidate.userId, null);
      const pick = pickNudgeFact(facts, now);
      if (!pick) {
        silent++;
        continue;
      }

      // No real, currently-active transit ties to this fact's topic for this
      // reader's own chart — stay silent rather than fabricate one.
      const transit = matchTransitForPick(pick, candidate.moonSign, currentSigns);
      if (!transit) {
        silent++;
        continue;
      }

      const lang = normalizeLang(candidate.locale);
      const ai = await generateFactNudgeCopy(pick, transit, lang);
      const copy: FactNudgeCopy = ai ?? getFactNudgeFallback(pick.tier, lang);
      if (!ai) fallbacks++;

      if (opts.dryRun) {
        logger.info(
          {
            userId: candidate.userId,
            lang,
            tier: pick.tier,
            planet: transit.planet,
            house: transit.house,
            title: copy.title,
            body: copy.body,
          },
          'fact-nudge: [dry-run]',
        );
        sent++;
        continue;
      }

      await notifyUser(candidate.userId, {
        title: copy.title,
        body: copy.body,
        type: FACT_NUDGE_NOTIFICATION_TYPE,
        link: '/chat',
      });
      sent++;
    }

    logger.info(
      { dateStr, candidates: candidates.length, silent, sent, fallbacks },
      'fact-nudge: done',
    );
    return { skipped: false, candidates: candidates.length, silent, sent, fallbacks };
  } finally {
    await release('fact-nudge-send', dateStr, lock.owner);
  }
}
