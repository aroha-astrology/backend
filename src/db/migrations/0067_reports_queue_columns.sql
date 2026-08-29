-- Backoff gate for a requeued (previously failed) row — NULL means runnable now,
-- which is every fresh purchase. See requeueReportForRetry in reports.repo.ts.
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone;
--> statement-breakpoint
-- The queue's only read path: "oldest runnable queued row, oldest first". Partial
-- so it stays a handful of rows regardless of table size — this is polled on every
-- generation completion, not just by the 5-minute reaper cron.
CREATE INDEX IF NOT EXISTS "reports_queued_idx"
	ON "reports" ("next_attempt_at", "created_at")
	WHERE "status" = 'queued';
--> statement-breakpoint
-- A row inserted without an explicit status has certainly not started; defaulting it
-- to 'generating' would strand it (nothing runs it, and the stale reaper skips rows
-- with no started_at). Only claimReportRow inserts today, and it always sets status
-- explicitly — this just makes the fallback safe.
ALTER TABLE "reports" ALTER COLUMN "status" SET DEFAULT 'queued';
