-- =============================================================================
-- Report generation retry budget (architecture hardening, phase 7)
-- =============================================================================
-- Hand-written, not drizzle-kit-generated — same reason as every other
-- hand-written migration in this file: the last snapshot on disk is 0049
-- even though migrations exist through 0052, so `drizzle-kit generate` diffs
-- against a stale baseline and reinvents already-applied objects.
--
-- generation_attempts bounds how many times reapStaleReports will
-- reclaim-and-retry the SAME stale row before giving up and refunding it
-- (see MAX_REPORT_GENERATION_ATTEMPTS, reports.service.ts). Defaults to 0,
-- correct for every existing row (none of them have been through the
-- reaper's new retry path).
-- =============================================================================

ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "generation_attempts" integer NOT NULL DEFAULT 0;
