-- Birth Time Confidence: a check on an UNKNOWN birth time is not shown the
-- moment it is asked for. The answer is worked out straight away but held back
-- until reveal_at (a random 40-89 minutes later), and the user gets a push when
-- it is ready. notified_at marks that the push went out, so it goes out once.
--
-- reveal_at IS NULL means "show at once" (every row from before this change,
-- and every check on a time the user gave as exact or approximate), so old rows
-- keep working with no backfill.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe to
-- re-run. See 0075_birth_time_rectifications.sql.

ALTER TABLE "birth_time_rectifications"
  ADD COLUMN IF NOT EXISTS "reveal_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "notified_at" timestamp with time zone;

-- The sweep looks only at held-back rows that have not been pushed yet.
CREATE INDEX IF NOT EXISTS "birth_time_rectifications_due_idx"
  ON "birth_time_rectifications" ("reveal_at")
  WHERE "reveal_at" IS NOT NULL AND "notified_at" IS NULL;
