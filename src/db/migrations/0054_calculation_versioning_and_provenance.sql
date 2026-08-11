-- =============================================================================
-- Calculation versioning + report provenance (architecture hardening, phase 5)
-- =============================================================================
-- Hand-written, not drizzle-kit-generated — same reason as every other
-- hand-written migration in this file: the last snapshot on disk predates
-- several already-applied migrations, so `drizzle-kit generate` diffs
-- against a stale baseline and reinvents already-applied objects.
--
-- kundlis: calculation_version/ephemeris_version/node_type record what was
-- actually resolved at generation time (nullable, no backfill — existing rows
-- predate this and simply have no version stamp, which is correct: they were
-- never through a versioned pipeline). The corresponding birthHash change
-- (see kundli.service.ts's birthInputsForProfile) means the NEXT access to
-- any existing kundli already regenerates and stamps these automatically —
-- no bulk migration script needed here either.
--
-- reports: chart_snapshot freezes the exact chart/dasha/yoga/dosha facts a
-- purchased report was generated from, plus the calculation/ephemeris/
-- ayanamsa/house/node/prompt/language provenance fields — so a report never
-- silently changes if the engine or a user's ayanamsa preference is updated
-- later. Existing rows are left NULL (no snapshot to backfill from; their
-- provenance is genuinely unknown, which is honestly what a NULL means here).
-- =============================================================================

ALTER TABLE "kundlis" ADD COLUMN IF NOT EXISTS "calculation_version" text;
ALTER TABLE "kundlis" ADD COLUMN IF NOT EXISTS "ephemeris_version" text;
ALTER TABLE "kundlis" ADD COLUMN IF NOT EXISTS "node_type" text;

ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "chart_snapshot" jsonb;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "calculation_version" text;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "ephemeris_version" text;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "ayanamsa" text;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "house_system" text;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "node_type" text;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "prompt_version" text;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "language" text;
