-- User-facing "delete chat" is a soft delete: this column is set immediately
-- (hides the session from every read), then a daily cron hard-deletes rows
-- older than 7 days (see purgeOldDeletedChatSessions in chat-sessions.repo.ts).
-- user_facts has no FK to chat_sessions, so this never touches extracted facts.
--
-- Guarded so it is safe to re-run: this repo has a history of migrations being
-- applied by hand on the box and then reconciled in the journal afterwards.
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
-- The purge cron and the list/get reads both filter on this being non-null or
-- null respectively; partial index keeps the purge sweep cheap.
CREATE INDEX IF NOT EXISTS "chat_sessions_deleted_at_idx"
	ON "chat_sessions" ("deleted_at")
	WHERE "deleted_at" IS NOT NULL;
