// =============================================================================
// "Your birth time is ready" push
// =============================================================================
// A birth-time check on an unknown time is held back until its reveal_at (see
// insights.service.ts, pickRevealDelayMinutes). The answer itself is time-based
// — it shows the moment reveal_at passes whether or not this sweep has run — so
// this job only does the push. It claims each due row first (an atomic
// UPDATE ... WHERE notified_at IS NULL), so overlapping sweeps can't send the
// same user two pushes.
// =============================================================================

import { notifyUser } from '../../lib/notifications/notify-user.js';
import { logger } from '../../lib/logger.js';
import { claimDueRectifications } from '../insights/birth-time.repo.js';

export const BIRTH_TIME_READY_NOTIFICATION_TYPE = 'birth_time_ready';

const TITLE = 'Your birth time is ready';
const BODY = "We've finished matching your life events. Open Aroha to see your birth time.";
const BATCH = 200;

export interface BirthTimeReadyResult {
  notified: number;
}

export async function runBirthTimeReady(now: Date = new Date()): Promise<BirthTimeReadyResult> {
  const claimed = await claimDueRectifications(now, BATCH);
  let notified = 0;
  for (const row of claimed) {
    try {
      await notifyUser(row.userId, {
        title: TITLE,
        body: BODY,
        type: BIRTH_TIME_READY_NOTIFICATION_TYPE,
        link: '/kundli',
      });
      notified++;
    } catch (err) {
      logger.warn({ err, userId: row.userId }, 'birth-time-ready: failed to notify user');
    }
  }
  return { notified };
}
