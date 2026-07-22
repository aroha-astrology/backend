import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  transitRecipientsQuery,
  DORMANT_AFTER_DAYS,
  DORMANT_MIN_GAP_DAYS,
  TRANSIT_NOTIFICATION_TYPE,
} from '../src/modules/cron/transit-alert.repo.js';

/**
 * The recipient query is raw SQL, so mocking the repo (as the send tests do)
 * cannot exercise it. These tests render it through the real Postgres dialect
 * and assert its shape.
 *
 * That catches template/binding mistakes and guards the specific clauses that
 * are easy to "simplify" into being wrong later. It does NOT prove the query
 * returns the right rows against real data — only running it against a
 * database does that, and there is none on this machine.
 */
function render() {
  const { sql, params } = new PgDialect().sqlToQuery(transitRecipientsQuery());
  return { sql: sql.replace(/\s+/g, ' ').trim(), params };
}

describe('transitRecipientsQuery', () => {
  it('renders without throwing and binds every parameter positionally', () => {
    const { sql, params } = render();
    expect(sql.startsWith('SELECT')).toBe(true);
    // The three interpolated values, in the order they appear in the query.
    expect(params).toEqual([DORMANT_AFTER_DAYS, TRANSIT_NOTIFICATION_TYPE, DORMANT_MIN_GAP_DAYS]);
    expect(sql).toContain('$1');
    expect(sql).toContain('$2');
    expect(sql).toContain('$3');
  });

  it('never interpolates the notification type as a literal', () => {
    // It is bound, not concatenated — the difference between a parameter and
    // an injection point.
    const { sql } = render();
    expect(sql).not.toContain(`'${TRANSIT_NOTIFICATION_TYPE}'`);
  });

  it('treats a user who never returned after signup as active, not dormant', () => {
    // last_active_at is NULL until the user comes back at least once. A bare
    // `last_active_at > cutoff` would silently exclude every brand-new user,
    // which is the exact bug COALESCE exists to prevent (same reasoning as the
    // nightly horoscope batch).
    const { sql } = render();
    expect(sql).toMatch(/COALESCE\(\s*u\.last_active_at,\s*u\.created_at\s*\)/i);
    expect(sql).not.toMatch(/[^(,]\s*u\.last_active_at\s*>/i);
  });

  it('throttles dormant users via a NOT EXISTS over prior alerts of this type', () => {
    const { sql } = render();
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('FROM notifications n');
    expect(sql).toMatch(/n\.type\s*=\s*\$2/);
    // Dormant OR not-recently-alerted — an active user must never be filtered
    // out by the throttle.
    expect(sql).toMatch(/OR\s+NOT EXISTS/i);
  });

  it('excludes revoked and push-disabled devices, and deleted users', () => {
    const { sql } = render();
    expect(sql).toContain('dpt.revoked_at IS NULL');
    // NULL push_enabled means "OS permission state unknown" and counts as
    // enabled; spelled as an OR because `!= FALSE` would drop NULL rows.
    expect(sql).toMatch(/dpt\.push_enabled IS NULL OR dpt\.push_enabled = TRUE/i);
    expect(sql).toContain('u.deleted_at IS NULL');
  });

  it('reads the Moon sign from the primary chart only', () => {
    const { sql } = render();
    // birth_profile_id IS NULL is the account holder's own chart; the alert is
    // about their life, not a saved profile's.
    expect(sql).toMatch(/LEFT JOIN kundlis k .*k\.birth_profile_id IS NULL/i);
    expect(sql).toContain(`k.dosha_data->'sadeSati'->>'moonSign'`);
  });

  it('LEFT JOINs the chart so users without one still receive an alert', () => {
    const { sql } = render();
    expect(sql).toContain('LEFT JOIN kundlis');
    expect(sql).not.toMatch(/INNER JOIN kundlis|(?<!LEFT )JOIN kundlis/i);
  });
});
