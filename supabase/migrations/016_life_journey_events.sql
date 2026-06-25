-- Life journey AI-generated events with feedback persistence
-- Events are generated once per (chart, phase) and reused on subsequent visits.
-- On 'disagree' the row is deactivated (kept as blacklist) and a fresh row inserted.
-- On 'maybe' the same row is updated in-place with refined storytelling.
-- On 'agree' only the feedback column updates.

CREATE TABLE IF NOT EXISTS life_journey_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_id UUID NOT NULL REFERENCES kundli_charts(id) ON DELETE CASCADE,
  phase_index INTEGER NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 4),
  short_text TEXT NOT NULL,
  story_text TEXT NOT NULL,
  feedback TEXT CHECK (feedback IN ('agree', 'maybe', 'disagree')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  parent_event_id UUID REFERENCES life_journey_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active event per slot
CREATE UNIQUE INDEX IF NOT EXISTS life_journey_events_active_uniq
  ON life_journey_events (chart_id, phase_index, slot)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS life_journey_events_user_chart_idx
  ON life_journey_events (user_id, chart_id, phase_index);

CREATE INDEX IF NOT EXISTS life_journey_events_blacklist_idx
  ON life_journey_events (chart_id, phase_index, slot)
  WHERE feedback = 'disagree' AND is_active = false;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION life_journey_events_touch() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS life_journey_events_touch_trg ON life_journey_events;
CREATE TRIGGER life_journey_events_touch_trg
  BEFORE UPDATE ON life_journey_events
  FOR EACH ROW EXECUTE FUNCTION life_journey_events_touch();

ALTER TABLE life_journey_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lje_select_own"
  ON life_journey_events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "lje_insert_own"
  ON life_journey_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lje_update_own"
  ON life_journey_events FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lje_delete_own"
  ON life_journey_events FOR DELETE
  USING (user_id = auth.uid());
