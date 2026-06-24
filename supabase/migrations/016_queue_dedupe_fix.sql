-- Fix generation_queue dedupe index to discriminate by feature_key and type.
--
-- The original index keyed on (user_id, job_type, chart_id, phase_index) only.
-- This collapsed all feature_lite jobs (different feature_key) and all prediction
-- jobs (different type) into a single active row per chart, silently dropping
-- every job after the first one in a batch insert.
--
-- New index adds feature_key and type as discriminators so each feature/prediction
-- type gets its own independent queue slot.

DROP INDEX IF EXISTS generation_queue_dedupe;

CREATE UNIQUE INDEX generation_queue_dedupe
  ON generation_queue (
    user_id,
    job_type,
    (COALESCE(payload->>'chart_id',    '')),
    (COALESCE(payload->>'phase_index', '')),
    (COALESCE(payload->>'feature_key', '')),
    (COALESCE(payload->>'type',        ''))
  )
  WHERE status IN ('pending', 'processing');
