-- After a voice call the app asks how it went: 1 to 5 stars, a few quick
-- tags (clear voice, call cut, wrong language, ...) and an optional comment.
-- One answer per call, so it lives on the call's own row. The comment is
-- stored encrypted (field-encryption), like report rating comments.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "voice_sessions"
  ADD COLUMN IF NOT EXISTS "feedback_rating" smallint,
  ADD COLUMN IF NOT EXISTS "feedback_tags" text[],
  ADD COLUMN IF NOT EXISTS "feedback_comment" text,
  ADD COLUMN IF NOT EXISTS "feedback_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "voice_sessions_feedback_idx"
  ON "voice_sessions" ("feedback_at")
  WHERE "feedback_at" IS NOT NULL;
