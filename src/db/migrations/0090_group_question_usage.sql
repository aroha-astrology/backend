-- Admin user groups get the top Pass tier free and are never charged for a chat
-- question. Their "N questions left" line used to stay at the full allowance
-- forever, because nothing counted them. These two columns count a group
-- member's questions in a rolling 30-day period (reset lazily on the next
-- question, see consumeGroupQuestion in modules/pass/pass.repo.ts), so the
-- count goes down like a buyer's. Running out still costs them nothing.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "group_questions_used" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "group_questions_period_start" timestamp with time zone;
