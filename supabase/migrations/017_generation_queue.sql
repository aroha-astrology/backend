-- Background generation queue
-- After onboarding (or any chart creation) we enqueue heavy AI/computation jobs.
-- A client-side worker (QueueProcessor) picks pending rows, fires the matching
-- API, then marks them done. If a user opens a feature manually, that endpoint
-- also dequeues the matching row so we never double-generate.

CREATE TABLE IF NOT EXISTS generation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  -- payload holds chart_id + any per-job args (phase_index, sign, etc).
  -- Querying by payload uses jsonb operators.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'skipped')),
  priority INT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Worker pickup index: pending jobs by priority then age
CREATE INDEX IF NOT EXISTS generation_queue_pickup_idx
  ON generation_queue (status, priority DESC, created_at)
  WHERE status IN ('pending', 'processing');

-- Per-user listing
CREATE INDEX IF NOT EXISTS generation_queue_user_idx
  ON generation_queue (user_id, status, created_at DESC);

-- Dedupe: at most one open (pending/processing) job per
-- (user, type, chart_id, phase_index). NULLs treated as equal via COALESCE.
CREATE UNIQUE INDEX IF NOT EXISTS generation_queue_dedupe
  ON generation_queue (
    user_id,
    job_type,
    (COALESCE(payload->>'chart_id', '')),
    (COALESCE(payload->>'phase_index', ''))
  )
  WHERE status IN ('pending', 'processing');

ALTER TABLE generation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue_select_own" ON generation_queue
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "queue_insert_own" ON generation_queue
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "queue_update_own" ON generation_queue
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "queue_delete_own" ON generation_queue
  FOR DELETE USING (user_id = auth.uid());

-- Atomic claim: pick the next pending job for this user, mark it 'processing',
-- and return it. SKIP LOCKED ensures two concurrent workers never grab the
-- same row. Used by /api/queue/claim.
CREATE OR REPLACE FUNCTION claim_next_queue_job(p_user_id UUID)
RETURNS SETOF generation_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE generation_queue q
  SET status = 'processing',
      started_at = now(),
      attempts = q.attempts + 1
  WHERE q.id = (
    SELECT id FROM generation_queue
    WHERE user_id = p_user_id
      AND status = 'pending'
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING q.*;
END;
$$;
