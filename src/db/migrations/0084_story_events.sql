-- Daily Stories: who opened a story, who shared it and where. One row per
-- user, IST day, kind ('view' | 'share'), story and share channel, with a
-- running count, so the table grows with users per day rather than with taps.
-- The admin dashboard's Daily Stories card reads from here.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe
-- to re-run. See 0074_feature_unlocks_and_signup_bonus.sql.

CREATE TABLE IF NOT EXISTS "story_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_date" date NOT NULL,
  "kind" text NOT NULL,
  "story_id" text NOT NULL,
  "channel" text DEFAULT '' NOT NULL,
  "count" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "story_events_user_day_event_unique"
  ON "story_events" ("user_id", "event_date", "kind", "story_id", "channel");

CREATE INDEX IF NOT EXISTS "story_events_created_at_idx"
  ON "story_events" ("created_at");
