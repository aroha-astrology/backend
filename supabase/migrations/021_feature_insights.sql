-- ============================================================================
-- 021: feature_insights — per-feature AI content cache
-- Single source of truth for every feature surface's rendered content.
-- Keyed by (user_id, chart_id, feature_key, params_hash, language).
-- source column drives precedence: report_enriched > lite_ai > deterministic.
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_insights (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chart_id        uuid REFERENCES kundli_charts(id) ON DELETE CASCADE,
  profile_id      uuid REFERENCES birth_profiles(id) ON DELETE SET NULL,
  feature_key     text NOT NULL,
  params_hash     text NOT NULL DEFAULT '',
  language        text NOT NULL DEFAULT 'en',
  source          text NOT NULL CHECK (source IN ('lite_ai', 'report_enriched', 'deterministic')),
  source_version  int  NOT NULL DEFAULT 1,
  report_id       uuid REFERENCES generated_reports(id) ON DELETE SET NULL,
  content         jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,

  UNIQUE (user_id, chart_id, feature_key, params_hash, language)
);

CREATE INDEX IF NOT EXISTS idx_feature_insights_user_chart
  ON feature_insights (user_id, chart_id);

CREATE INDEX IF NOT EXISTS idx_feature_insights_report
  ON feature_insights (report_id)
  WHERE report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feature_insights_expires
  ON feature_insights (expires_at)
  WHERE expires_at IS NOT NULL;

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE feature_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_insights"
  ON feature_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_insights"
  ON feature_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role (used by the queue worker) can update rows regardless of user.
-- This policy is intentionally permissive for UPDATE — the queue worker runs
-- with service_role which bypasses RLS, but we define it for completeness.
CREATE POLICY "service_role_update_insights"
  ON feature_insights FOR UPDATE
  USING (true);

-- ── Conditional upsert function ───────────────────────────────────────────────
-- Enforces precedence: report_enriched always wins; lite_ai wins over
-- deterministic; same source refreshes. Race-losers are silently dropped.
-- SECURITY DEFINER so the queue worker (service_role) can call it safely.

CREATE OR REPLACE FUNCTION upsert_feature_insight(
  p_user_id        uuid,
  p_chart_id       uuid,
  p_feature_key    text,
  p_params_hash    text,
  p_language       text,
  p_source         text,
  p_source_version int,
  p_content        jsonb,
  p_report_id      uuid,
  p_expires_at     timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO feature_insights (
    user_id, chart_id, feature_key, params_hash, language,
    source, source_version, content, report_id, expires_at
  ) VALUES (
    p_user_id, p_chart_id, p_feature_key, p_params_hash, p_language,
    p_source, p_source_version, p_content, p_report_id, p_expires_at
  )
  ON CONFLICT (user_id, chart_id, feature_key, params_hash, language)
  DO UPDATE SET
    content         = EXCLUDED.content,
    source          = EXCLUDED.source,
    source_version  = EXCLUDED.source_version,
    report_id       = EXCLUDED.report_id,
    generated_at    = now(),
    expires_at      = EXCLUDED.expires_at
  WHERE
    -- report_enriched always overwrites anything
    (EXCLUDED.source = 'report_enriched')
    -- lite_ai overwrites only deterministic
    OR (EXCLUDED.source = 'lite_ai'
        AND feature_insights.source = 'deterministic')
    -- same source: refresh (handles report re-generation & cache refresh)
    OR (EXCLUDED.source = feature_insights.source);
END;
$$;

-- ── Cascade-clear trigger: invalidate cache when chart recalculated ───────────
-- When chart_data changes (e.g., dob correction), all cached insights for
-- that chart become stale and must be rebuilt on next read.

CREATE OR REPLACE FUNCTION fn_invalidate_chart_insights()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM feature_insights WHERE chart_id = NEW.id;
  -- Also clear open lite/enrich queue jobs for this chart
  UPDATE generation_queue
    SET status = 'skipped', completed_at = now()
  WHERE payload->>'chart_id' = NEW.id::text
    AND job_type IN ('feature_lite', 'feature_enrich')
    AND status IN ('pending', 'processing');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_invalidate_chart_insights
AFTER UPDATE ON kundli_charts
FOR EACH ROW
WHEN (OLD.chart_data IS DISTINCT FROM NEW.chart_data)
EXECUTE FUNCTION fn_invalidate_chart_insights();
