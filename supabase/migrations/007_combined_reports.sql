-- ============================================================================
-- 007: Combined palm + kundli reports
-- ============================================================================
-- After a user has both a palm reading and a kundli chart, we can generate a
-- single reconciled report that treats them as two views of the same soul.
-- This migration extends the generated_reports.report_type CHECK constraint
-- so we can persist that new report kind, and adds metadata columns for the
-- source palm_reading_id and chart_id.
-- ============================================================================

ALTER TABLE generated_reports
  DROP CONSTRAINT IF EXISTS generated_reports_report_type_check;

ALTER TABLE generated_reports
  ADD CONSTRAINT generated_reports_report_type_check
  CHECK (report_type IN (
    'numerology',
    'kundli_basic',
    'kundli_standard',
    'kundli_premium',
    'combined_palm_kundli'
  ));

ALTER TABLE generated_reports
  ADD COLUMN IF NOT EXISTS palm_reading_id uuid REFERENCES palm_readings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chart_id uuid REFERENCES kundli_charts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generated_reports_palm
  ON generated_reports(user_id, palm_reading_id)
  WHERE palm_reading_id IS NOT NULL;
