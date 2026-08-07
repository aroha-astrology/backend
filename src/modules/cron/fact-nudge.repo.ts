import { sql } from 'drizzle-orm';
import { db } from '../../config/db.js';

export const FACT_NUDGE_NOTIFICATION_TYPE = 'fact_nudge';

/** Minimum gap between two fact-nudge sends to the same user — wider than the twice-a-month cadence itself, so a retried/duplicate cron firing can never double-notify. */
export const FACT_NUDGE_MIN_GAP_DAYS = 12;

export interface FactNudgeCandidate {
  userId: string;
  locale: string | null;
}

/**
 * Every user who has at least one saved fact and hasn't received a
 * fact-nudge in the last FACT_NUDGE_MIN_GAP_DAYS. Deliberately NOT filtered
 * on device_push_tokens — `notifyUser()` already writes the Bell inbox row
 * regardless of push reachability, and silently skips the FCM half when the
 * user has no live token.
 */
export async function listFactNudgeCandidates(): Promise<FactNudgeCandidate[]> {
  const rows = await db.execute<{ user_id: string; locale: string | null }>(sql`
    SELECT DISTINCT uf.user_id, u.locale
    FROM user_facts uf
    JOIN users u ON u.id = uf.user_id
    WHERE u.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = uf.user_id
          AND n.type = ${FACT_NUDGE_NOTIFICATION_TYPE}
          AND n.created_at > now() - ${FACT_NUDGE_MIN_GAP_DAYS} * interval '1 day'
      )
  `);
  return Array.from(rows).map((r) => ({ userId: r.user_id, locale: r.locale }));
}
