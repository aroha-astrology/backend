-- Vastu Studio: version history for saved homes. A snapshot of the home's
-- stored layout/score/rule set, taken on demand ("Save version") and
-- automatically before a restore so a restore is itself undoable. The
-- per-home cap (oldest pruned first) is enforced by the service.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS guards make this safe
-- to re-run. See 0074_feature_unlocks_and_signup_bonus.sql.

CREATE TABLE IF NOT EXISTS "vastu_home_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "home_id" uuid NOT NULL REFERENCES "vastu_homes"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "layout" jsonb NOT NULL,
  "overall_score" integer,
  "rule_set_id" text DEFAULT 'aroha-traditional-v1' NOT NULL,
  "label" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "vastu_home_versions_home_created_idx"
  ON "vastu_home_versions" ("home_id", "created_at");
