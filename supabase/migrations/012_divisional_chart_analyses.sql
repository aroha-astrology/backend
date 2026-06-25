-- ============================================================================
-- 012: Divisional chart AI analyses
--
-- Stores Yogi Baba's narrative interpretation of each varga (divisional chart)
-- for a user's kundli. The raw planet-sign data already lives in
-- kundli_charts.divisional_charts; this table adds the AI layer on top.
--
-- Generation is triggered three ways:
--   1. User clicks "Generate Analysis" on /vargas (explicit request)
--   2. Background auto-generation after a report render finishes (idle LLM)
--   3. Any future scheduled / webhook trigger
-- ============================================================================

CREATE TABLE IF NOT EXISTS divisional_chart_analyses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kundli_chart_id  UUID NOT NULL REFERENCES kundli_charts(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_type       TEXT NOT NULL,                        -- 'D1','D2','D9','D10', etc.
  analysis         TEXT,                                 -- Yogi Baba narrative (3 paragraphs)
  key_findings     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- string[] of 5 bullet points
  status           TEXT NOT NULL DEFAULT 'pending',      -- pending|generating|ready|error
  error_message    TEXT,
  generated_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One analysis per (kundli, chart type) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_dca_kundli_type
  ON divisional_chart_analyses(kundli_chart_id, chart_type);

-- Fast lookup of all analyses for a user in a given status
CREATE INDEX IF NOT EXISTS idx_dca_user_status
  ON divisional_chart_analyses(user_id, status);

-- Queue order for background processing (oldest pending first)
CREATE INDEX IF NOT EXISTS idx_dca_pending_queue
  ON divisional_chart_analyses(created_at ASC)
  WHERE status = 'pending';

ALTER TABLE divisional_chart_analyses ENABLE ROW LEVEL SECURITY;

-- Users can read their own analyses (service role handles inserts/updates).
CREATE POLICY "dca_select_own" ON divisional_chart_analyses
  FOR SELECT USING (auth.uid() = user_id);

-- Users can delete their own (e.g. "regenerate" flow deletes then re-inserts).
CREATE POLICY "dca_delete_own" ON divisional_chart_analyses
  FOR DELETE USING (auth.uid() = user_id);
