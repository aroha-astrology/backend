-- Voice call became a Pass benefit: a member gets a few free minutes in each
-- Pass period and pays from the wallet after that. This column records how many
-- of a session's minutes were the free ones, so the period's allowance can be
-- counted across calls and a free minute is never refunded as money.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "voice_sessions"
  ADD COLUMN IF NOT EXISTS "free_minutes" integer DEFAULT 0 NOT NULL;
