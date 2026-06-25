-- ============================================================================
-- 053: User presence heartbeat
--
-- One row per user, refreshed by a 60s client heartbeat (POST /api/presence/ping).
-- Admin UI reads `last_ping_at` to render the green "online" dot.
--
-- A separate single-row-per-user table (rather than appending to
-- user_activity_log) keeps the activity feed clean — at one ping per minute
-- per active user, heartbeats would otherwise dominate the log.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_presence (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_ping_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_presence_last_ping
  ON user_presence(last_ping_at DESC);

ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- A user may read their own presence row (rarely needed, but consistent).
CREATE POLICY "presence_select_own" ON user_presence
  FOR SELECT USING (auth.uid() = user_id);
