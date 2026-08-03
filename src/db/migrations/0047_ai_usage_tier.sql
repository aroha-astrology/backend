-- ai_usage: record which Gemini key tier served each call, and index the
-- column every cost query filters on.
--
-- `tier` is nullable on purpose: rows written before the paid reserve tier
-- existed cannot be attributed retroactively, and they were all free-tier
-- anyway, so NULL correctly reads as "not billed".
--
-- Guarded so it is safe to re-run: this repo has a history of migrations being
-- applied by hand on the box and then reconciled in the journal afterwards.
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "tier" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_created_at_idx" ON "ai_usage" USING btree ("created_at");
