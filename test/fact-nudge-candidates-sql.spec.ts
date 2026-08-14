import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  factNudgeCandidatesQuery,
  currentPlanetSignsQuery,
  FACT_NUDGE_MIN_GAP_DAYS,
  FACT_NUDGE_NOTIFICATION_TYPE,
} from '../src/modules/cron/fact-nudge.repo.js';

/**
 * Both queries below are raw SQL, so mocking the repo cannot exercise them —
 * same reasoning as transit-alert-recipients-sql.spec.ts. These render each
 * through the real Postgres dialect and assert shape, not against a live DB.
 */
function render(query: ReturnType<typeof factNudgeCandidatesQuery>) {
  const { sql, params } = new PgDialect().sqlToQuery(query);
  return { sql: sql.replace(/\s+/g, ' ').trim(), params };
}

describe('factNudgeCandidatesQuery', () => {
  it('renders without throwing and binds the notification type + gap positionally', () => {
    const { sql, params } = render(factNudgeCandidatesQuery());
    expect(sql.startsWith('SELECT')).toBe(true);
    expect(params).toEqual([FACT_NUDGE_NOTIFICATION_TYPE, FACT_NUDGE_MIN_GAP_DAYS]);
  });

  it('reads the Moon sign from the primary chart only, left-joined so a chartless user still qualifies', () => {
    const { sql } = render(factNudgeCandidatesQuery());
    expect(sql).toMatch(/LEFT JOIN kundlis k .*k\.birth_profile_id IS NULL/i);
    expect(sql).toContain(`k.dosha_data->'sadeSati'->>'moonSign'`);
  });

  it('excludes deleted users and throttles via NOT EXISTS on prior fact-nudge sends', () => {
    const { sql } = render(factNudgeCandidatesQuery());
    expect(sql).toContain('u.deleted_at IS NULL');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toMatch(/n\.type\s*=\s*\$1/);
  });
});

describe('currentPlanetSignsQuery', () => {
  it('renders as a DISTINCT ON over ingress events at or before now, newest first', () => {
    const now = new Date('2026-08-14T00:00:00Z');
    const { sql, params } = render(currentPlanetSignsQuery(now));
    expect(sql).toMatch(/DISTINCT ON \(planet\)/i);
    expect(sql).toContain("event_type = 'ingress'");
    expect(sql).toMatch(/exact_at <= \$1/);
    expect(sql).toMatch(/ORDER BY planet, exact_at DESC/i);
    expect(params).toEqual([now]);
  });

  it('excludes station events, which carry no destination sign', () => {
    const { sql } = render(currentPlanetSignsQuery(new Date()));
    expect(sql).toContain('to_sign IS NOT NULL');
  });
});
