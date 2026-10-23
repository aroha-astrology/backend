-- Morning Ritual (v7 spec, Sprint 3). Ships OFF behind the `ritual.morning` switch.
--
-- ritual_completions: one row per user per local day (the reader's own zone, same clock as the daily
--   reward). card_index is the Prashna card (0-107) the day showed. streak_day is the merged streak
--   (the daily reward streak) after this ritual.
-- ritual_state: the shield count (a spare day that keeps the streak alive), the Cosmic Keys collected,
--   and the dates a shield has covered (the daily reward streak counts those as claimed).
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

CREATE TABLE IF NOT EXISTS "ritual_completions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "local_date" text NOT NULL,
  "time_zone" text NOT NULL,
  "card_index" smallint NOT NULL CHECK ("card_index" BETWEEN 0 AND 107),
  "practice" text NOT NULL CHECK ("practice" IN ('jap', 'breath')),
  "mood" smallint CHECK ("mood" BETWEEN 1 AND 5),
  "streak_day" integer NOT NULL,
  "key_granted" boolean NOT NULL DEFAULT false,
  "shield_earned" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ritual_completions_user_date_uq"
  ON "ritual_completions" ("user_id", "local_date");

CREATE TABLE IF NOT EXISTS "ritual_state" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "shields" integer NOT NULL DEFAULT 0 CHECK ("shields" BETWEEN 0 AND 2),
  "cosmic_keys" integer NOT NULL DEFAULT 0 CHECK ("cosmic_keys" >= 0),
  "shielded_dates" text[] NOT NULL DEFAULT '{}',
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
