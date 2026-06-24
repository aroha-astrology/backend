-- ============================================================================
-- 014: User activity log
--
-- Tracks page views and discrete user actions so the admin panel can show
-- a per-user timeline of what they visited, used, and did.
-- Inserts are performed by the service-role client in /api/activity/log so
-- users cannot forge their own events. Users can only read their own rows.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_activity_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   TEXT,                    -- random UUID from browser sessionStorage, groups a visit
  event_type   TEXT        NOT NULL,    -- page_view | feature_used | report_generated | credit_spent | chat_message | error
  page         TEXT,                    -- URL path, e.g. /kundli/abc123
  action       TEXT,                    -- specific action within page, e.g. generate_report
  label        TEXT,                    -- human-readable label, e.g. "Vedic Kundli Report"
  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ip           TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user_created
  ON user_activity_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_created
  ON user_activity_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_event_type
  ON user_activity_log(event_type);

CREATE INDEX IF NOT EXISTS idx_activity_session
  ON user_activity_log(session_id);

ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own activity
CREATE POLICY "activity_select_own" ON user_activity_log
  FOR SELECT USING (auth.uid() = user_id);
