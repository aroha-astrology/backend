-- Storytelling life-area insights for the My Life present-chapter view.
-- One row per (chart, phase, area). Generated once, reused on revisit, and
-- pre-built by the background queue after onboarding.

CREATE TABLE IF NOT EXISTS life_area_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_id UUID NOT NULL REFERENCES kundli_charts(id) ON DELETE CASCADE,
  phase_index INTEGER NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('Career', 'Love', 'Money', 'Health')),
  status TEXT NOT NULL CHECK (status IN ('good', 'neutral', 'challenging')),
  brief TEXT NOT NULL,           -- one-line headline shown on the collapsed card
  story TEXT NOT NULL,           -- 3-4 sentence narrative shown when expanded
  key_insights JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of practical bullet points
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS life_area_insights_uniq
  ON life_area_insights (chart_id, phase_index, area);

CREATE INDEX IF NOT EXISTS life_area_insights_user_idx
  ON life_area_insights (user_id, chart_id, phase_index);

ALTER TABLE life_area_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lai_select_own" ON life_area_insights
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "lai_insert_own" ON life_area_insights
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "lai_update_own" ON life_area_insights
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "lai_delete_own" ON life_area_insights
  FOR DELETE USING (user_id = auth.uid());
