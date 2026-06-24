-- ============================================================================
-- 025: purge_reports — delete all report data, no table drops (re-enable safe)
-- ============================================================================
-- Clears every row from report-related tables so the app runs clean with no
-- report data. Tables are kept so re-enabling reports requires only a code
-- change (no new migrations). Run: supabase db push

TRUNCATE TABLE generated_reports  RESTART IDENTITY CASCADE;
TRUNCATE TABLE neural_pathways     RESTART IDENTITY CASCADE;

-- Also clear any pending generation queue jobs tied to reports
DELETE FROM generation_queue
  WHERE job_type IN (
    'kundli_insights',
    'numerology',
    'feature_enrich',
    'feature_lite',
    'life_journey_phase'
  );
