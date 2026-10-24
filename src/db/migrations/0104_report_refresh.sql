-- 2026-10-24 owner: reports written before the corrected engine (CALCULATION_VERSION 2026.10.2)
-- and real transit dates are rebuilt free when opened; these columns are the cross-worker
-- claim, the retry count (3 tries, then the old report is shown) and the Admin counts.
-- 0104 follows main's 0103 (palm); dated between it and the v7 branch's first migration.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "refresh_started_at" timestamp with time zone;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "refresh_attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "refreshed_at" timestamp with time zone;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "refresh_error" text;
