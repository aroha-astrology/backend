-- =============================================================================
-- prediction_outcomes — make predictions falsifiable
-- =============================================================================
-- Until now nothing in this system could answer "was that prediction right?".
-- `feedback_counters` is a GLOBAL counter and the per-user vote log attributes a
-- vote to a USER, never to the specific claim being rated. So every accuracy
-- change — strength gating, Bhava Chalit, Varshphal, all of it — shipped
-- unmeasurable.
--
-- One row per dated, falsifiable claim. Deliberately narrow: only predictions
-- with a WINDOW (a start and end date) go in here, because those are the only
-- ones that can later be checked against what actually happened. Character
-- readings and general advice are not recorded — there is nothing to score.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "prediction_outcomes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  -- NULL = the primary/self profile, matching the convention on reports/kundlis.
  "birth_profile_id" uuid,

  -- Where the claim was made: 'chat' | 'horoscope' | 'report' | 'transit_alert'.
  "surface" text NOT NULL,
  -- The originating row where one exists (report id, horoscope id, session id).
  "source_id" text,
  -- Life area the claim is about (career/love/health/...), see dasha-confidence.
  "domain" text,

  -- The falsifiable part: what was predicted, and for when.
  "claim" text NOT NULL,
  "window_start" date,
  "window_end" date,
  -- HIGH | MEDIUM | LOW, as scored by dasha-confidence.ts at prediction time.
  "confidence" text,

  -- Reproducibility: enough to re-derive why this claim was made.
  -- Hash (not the facts themselves) so this table never becomes a second copy
  -- of personal chart data.
  "facts_hash" text,
  "model" text,
  -- Which systems contributed, e.g. {shadbala,double_transit,varshphal}.
  "techniques" text[] NOT NULL DEFAULT '{}',

  -- The outcome. All nullable: a fresh row is simply unrated.
  -- -1 = wrong, 0 = unclear, 1 = right.
  "rating" smallint,
  -- Did the predicted event actually occur, asked once the window has closed.
  "happened" boolean,
  "rated_at" timestamp with time zone,

  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "prediction_outcomes"
    ADD CONSTRAINT "prediction_outcomes_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "prediction_outcomes"
    ADD CONSTRAINT "prediction_outcomes_birth_profile_id_birth_profiles_id_fk"
    FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- "which of this user's predictions are still unrated / due for review"
CREATE INDEX IF NOT EXISTS "prediction_outcomes_user_idx"
  ON "prediction_outcomes" ("user_id", "created_at" DESC);

-- The scoring query: closed windows that nobody has rated yet.
CREATE INDEX IF NOT EXISTS "prediction_outcomes_due_idx"
  ON "prediction_outcomes" ("window_end")
  WHERE "rating" IS NULL;

-- Accuracy rollups by surface/technique over time.
CREATE INDEX IF NOT EXISTS "prediction_outcomes_surface_idx"
  ON "prediction_outcomes" ("surface", "created_at" DESC);
