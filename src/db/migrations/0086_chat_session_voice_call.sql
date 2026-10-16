-- A finished voice call is saved as a chat session so its transcript shows in
-- Chat History. Until now nothing on that row said it had been a call, so the
-- app listed it as one more chat. These two columns let the list show it as a
-- call: which call it was (for the time and length), and a short note of what
-- was talked about (encrypted like the transcript; written after the call).
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "chat_sessions"
  ADD COLUMN IF NOT EXISTS "voice_session_id" uuid REFERENCES "voice_sessions"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "chat_sessions"
  ADD COLUMN IF NOT EXISTS "call_recap" text;
--> statement-breakpoint
-- Calls saved before this column existed: the transcript row is written right
-- after the call is marked ended, for the same user and profile, so the two
-- timestamps are within moments of each other. Safe to re-run: rows already
-- linked are skipped.
UPDATE "chat_sessions" AS cs
SET "voice_session_id" = vs."id"
FROM "voice_sessions" AS vs
WHERE cs."voice_session_id" IS NULL
  AND vs."ended_at" IS NOT NULL
  AND cs."user_id" = vs."user_id"
  AND cs."birth_profile_id" IS NOT DISTINCT FROM vs."birth_profile_id"
  AND cs."created_at" >= vs."ended_at" - interval '2 seconds'
  AND cs."created_at" <= vs."ended_at" + interval '30 seconds';
