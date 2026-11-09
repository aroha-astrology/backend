-- 2026-11-09 (sprint L1): which one-time launch pop-ups a user has already been shown
-- (e.g. 'varshik-2027'). Server truth, so a reinstall or a second phone does not repeat one.
-- Kept apart from tours_completed, which "Show me around again" clears.
--
-- Hand-written (post-0050 convention): ADD COLUMN IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "popups_seen" jsonb DEFAULT '[]'::jsonb NOT NULL;
