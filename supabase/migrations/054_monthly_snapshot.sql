-- ============================================================================
-- 054: Monthly cosmic snapshot
--
-- Single source of truth for monthly Vedic data that is the SAME for every
-- user (horoscopes per rashi, panchang day grid, transits, muhurta windows).
-- Pre-generated once per (year, month, language) by cron; consumed by
-- /api/monthly and downstream pages.
--
-- Replaces the previous pattern of stashing `monthly_<rashi>` rows in
-- daily_horoscopes — that table is keyed on per-day rashis and the overload
-- was awkward to query and cache.
-- ============================================================================

CREATE TABLE IF NOT EXISTS monthly_snapshot (
  year       INT  NOT NULL,
  month      INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  language   TEXT NOT NULL DEFAULT 'en',
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (year, month, language)
);

CREATE INDEX IF NOT EXISTS idx_monthly_snapshot_yearmonth
  ON monthly_snapshot(year DESC, month DESC);

-- Snapshot rows are public (same for everyone) — readable by any
-- authenticated client, writable only by service_role via the cron.
ALTER TABLE monthly_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_snapshot_read_all" ON monthly_snapshot
  FOR SELECT TO authenticated USING (true);
