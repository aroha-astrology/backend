-- Chat readiness gate: chat is locked until all background generation jobs complete.
ALTER TABLE kundli_charts
  ADD COLUMN IF NOT EXISTS chat_ready BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark existing charts (pre-migration) as ready so old users aren't locked out.
UPDATE kundli_charts SET chat_ready = TRUE
WHERE id NOT IN (
  SELECT DISTINCT (payload->>'chart_id')::UUID
  FROM generation_queue
  WHERE status IN ('pending', 'processing')
    AND payload->>'chart_id' IS NOT NULL
);
