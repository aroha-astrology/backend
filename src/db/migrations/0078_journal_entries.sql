-- Astro Journal (roadmap step 8): one daily check-in per user. The free-text
-- note and the life-event tags are personal, stored encrypted by the
-- application in "body"; the 1-5 ratings and the astro snapshot (dasha lords,
-- the Moon's sign and nakshatra that day) are plain so insights can group them.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe
-- to re-run. See 0074_feature_unlocks_and_signup_bonus.sql.

CREATE TABLE IF NOT EXISTS "journal_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "entry_date" date NOT NULL,
  "mood" smallint,
  "energy" smallint,
  "career" smallint,
  "relationship" smallint,
  "money" smallint,
  "body" text NOT NULL,
  "snapshot" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_user_date_unique"
  ON "journal_entries" ("user_id", "entry_date");
