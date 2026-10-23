-- Baba Ji memory and guide personas (v7 spec, Sprint 4). Ships OFF behind memory.* and chat.personas.
--
-- 1. user_facts grows dated events: event_kind / event_date (when the thing happens), status, a
--    follow_up_at moment (the hourly job sends one follow-up after it), followed_up_at (so it runs once),
--    transit_note (the sky line shown with the follow-up, encrypted like `fact`) and rectify_flag (the
--    reader confirmed a past event that can anchor a birth-time check).
-- 2. users.baba_free_reply_until: a one-shot "your first reply is free" token set when a follow-up push
--    goes out. chargeQuestion spends it before anything else.
-- 3. users.persona_id: the guide the reader chose for chat (null = Yogi Baba / the look's default).
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "user_facts"
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'ACTIVE' NOT NULL,
  ADD COLUMN IF NOT EXISTS "event_kind" text,
  ADD COLUMN IF NOT EXISTS "event_date" date,
  ADD COLUMN IF NOT EXISTS "follow_up_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "followed_up_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "transit_note" text,
  ADD COLUMN IF NOT EXISTS "rectify_flag" boolean DEFAULT false NOT NULL;

DO $$ BEGIN
  ALTER TABLE "user_facts" ADD CONSTRAINT "user_facts_status_check"
    CHECK ("status" IN ('ACTIVE', 'DONE', 'DISMISSED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "user_facts_follow_up_due_idx"
  ON "user_facts" ("follow_up_at")
  WHERE "follow_up_at" IS NOT NULL AND "followed_up_at" IS NULL AND "status" = 'ACTIVE';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "baba_free_reply_until" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "persona_id" text;
