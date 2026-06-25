-- ============================================================================
-- 011: In-app notifications (bell icon feed)
--
-- Each user gets their own notifications scoped by user_id with RLS, so
-- concurrent report generation by multiple users never crosses streams.
-- The /api/reports/render route inserts a row when status flips to 'ready';
-- the navbar bell subscribes via Supabase realtime to surface it instantly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                -- 'report_ready' | 'kundli_ready' | 'system' | ...
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                         -- where bell click should navigate
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Owners can read their notifications; service role bypasses RLS for inserts.
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Owners can mark their own notifications read.
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Owners can clear their own (used for "dismiss" / "clear all").
CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime broadcast on this table so the bell can subscribe live.
-- (Idempotent: ignores any error — publication may not exist on local dev,
-- or the table may already be added on re-runs.)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;
