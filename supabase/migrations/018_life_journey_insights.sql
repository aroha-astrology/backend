-- Life journey AI-generated per-area insights (title, story, do/avoid)
-- Cached per (chart, mahadasha_planet, antardasha_planet, area)

CREATE TABLE IF NOT EXISTS life_journey_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_id UUID NOT NULL REFERENCES kundli_charts(id) ON DELETE CASCADE,
  mahadasha_planet TEXT NOT NULL,
  antardasha_planet TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('Career', 'Love', 'Money', 'Health')),
  title TEXT NOT NULL,
  story TEXT NOT NULL,
  do_items JSONB NOT NULL DEFAULT '[]',
  avoid_items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS life_journey_insights_uniq
  ON life_journey_insights (chart_id, mahadasha_planet, antardasha_planet, area);

CREATE INDEX IF NOT EXISTS life_journey_insights_chart_idx
  ON life_journey_insights (user_id, chart_id);

ALTER TABLE life_journey_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lji_select_own"
  ON life_journey_insights FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "lji_insert_own"
  ON life_journey_insights FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lji_delete_own"
  ON life_journey_insights FOR DELETE
  USING (user_id = auth.uid());
