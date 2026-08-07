-- Account deletion becomes a reviewed request rather than an immediate erasure.
--
-- One nullable timestamp is the whole feature: set when the user taps Delete
-- Account, cleared when an admin approves (erasure ran) or rejects it. While
-- non-null we suppress push and horoscope generation for that user.
--
-- Guarded so it is safe to re-run: this repo has a history of migrations being
-- applied by hand on the box and then reconciled in the journal afterwards.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletion_requested_at" timestamp with time zone;
--> statement-breakpoint
-- The reminder cron and the push/horoscope guards both filter on this being
-- non-null, which is a tiny fraction of rows — partial index keeps it cheap.
CREATE INDEX IF NOT EXISTS "users_deletion_requested_at_idx"
	ON "users" ("deletion_requested_at")
	WHERE "deletion_requested_at" IS NOT NULL;
