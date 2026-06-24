-- Stores generated couple compatibility analyses so they can be re-viewed without re-running AI
CREATE TABLE IF NOT EXISTS couple_analyses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart1_id      UUID        NOT NULL REFERENCES kundli_charts(id) ON DELETE CASCADE,
  chart2_id      UUID        NOT NULL REFERENCES kundli_charts(id) ON DELETE CASCADE,
  husband_name   TEXT        NOT NULL DEFAULT '',
  wife_name      TEXT        NOT NULL DEFAULT '',
  total_score    INT         NOT NULL DEFAULT 0,
  max_score      INT         NOT NULL DEFAULT 36,
  compatibility  TEXT        NOT NULL DEFAULT '',
  result_data    JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE couple_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_couple_analyses" ON couple_analyses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_couple_analyses_user ON couple_analyses (user_id, created_at DESC);
