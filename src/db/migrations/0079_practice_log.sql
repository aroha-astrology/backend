-- Today's Practice (roadmap step 9): one row per practice item a user marked
-- done on a day (a chant reaching its jap count, or an action ticked off).
-- The unique index makes "done" idempotent.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe
-- to re-run. See 0074_feature_unlocks_and_signup_bonus.sql.

CREATE TABLE IF NOT EXISTS "practice_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "practice_date" date NOT NULL,
  "item_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "practice_log_user_date_item_unique"
  ON "practice_log" ("user_id", "practice_date", "item_id");
