import { sql, type SQL } from 'drizzle-orm';
import { db } from '../../config/db.js';

export const FACT_NUDGE_NOTIFICATION_TYPE = 'fact_nudge';

/** Minimum gap between two fact-nudge sends to the same user — wider than the twice-a-month cadence itself, so a retried/duplicate cron firing can never double-notify. */
export const FACT_NUDGE_MIN_GAP_DAYS = 12;

export interface FactNudgeCandidate {
  userId: string;
  locale: string | null;
  /** Natal Moon sign from the user's primary chart, or null if they have none — mirrors transit-alert.repo.ts's listTransitRecipients. */
  moonSign: string | null;
}

/**
 * Every user who has at least one saved fact and hasn't received a
 * fact-nudge in the last FACT_NUDGE_MIN_GAP_DAYS. Deliberately NOT filtered
 * on device_push_tokens — `notifyUser()` already writes the Bell inbox row
 * regardless of push reachability, and silently skips the FCM half when the
 * user has no live token.
 */
export function factNudgeCandidatesQuery(): SQL {
  return sql`
    SELECT DISTINCT uf.user_id, u.locale,
           k.dosha_data->'sadeSati'->>'moonSign' AS moon_sign
    FROM user_facts uf
    JOIN users u ON u.id = uf.user_id
    LEFT JOIN kundlis k ON k.user_id = uf.user_id AND k.birth_profile_id IS NULL
    WHERE u.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = uf.user_id
          AND n.type = ${FACT_NUDGE_NOTIFICATION_TYPE}
          AND n.created_at > now() - ${FACT_NUDGE_MIN_GAP_DAYS} * interval '1 day'
      )
  `;
}

export async function listFactNudgeCandidates(): Promise<FactNudgeCandidate[]> {
  const rows = await db.execute<{
    user_id: string;
    locale: string | null;
    moon_sign: string | null;
  }>(factNudgeCandidatesQuery());
  return Array.from(rows).map((r) => ({
    userId: r.user_id,
    locale: r.locale,
    moonSign: r.moon_sign,
  }));
}

/**
 * The sign every ingress-tracked planet (see INGRESS_PLANETS) is standing in
 * right now, derived from the same detected-transit calendar the transit-
 * alert cron already maintains — not a fresh ephemeris call. DISTINCT ON
 * picks each planet's most recent ingress at or before `now`.
 */
export function currentPlanetSignsQuery(now: Date): SQL {
  // now.toISOString(), not the raw Date: db.execute()'s postgres driver
  // doesn't type-tag bound params the way the query builder's typed
  // comparators do, and crashes trying to bind a Date directly.
  return sql`
    SELECT DISTINCT ON (planet) planet, to_sign AS sign
    FROM transit_events
    WHERE event_type = 'ingress' AND exact_at <= ${now.toISOString()} AND to_sign IS NOT NULL
    ORDER BY planet, exact_at DESC
  `;
}

export async function getCurrentPlanetSigns(
  now: Date,
): Promise<{ planet: string; sign: string }[]> {
  const rows = await db.execute<{ planet: string; sign: string }>(currentPlanetSignsQuery(now));
  return Array.from(rows);
}
