-- Palm Reading's full reading became an Aroha Pass benefit (2026-10-23): one unlock per Pass
-- period, counted by when each reading was unlocked. Readings unlocked before this column
-- existed keep NULL (they were paid from the wallet and never count against a Pass).
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "palm_readings" ADD COLUMN IF NOT EXISTS "unlocked_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "palm_readings_user_unlocked_idx"
  ON "palm_readings" ("user_id", "unlocked_at");
