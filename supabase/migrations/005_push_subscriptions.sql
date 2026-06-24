-- ============================================================================
-- 005: Web Push subscriptions (notify when reports are ready)
-- ============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owners can read/write their own subscriptions; service role bypasses RLS.
CREATE POLICY "push_subscriptions_owner" ON push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
