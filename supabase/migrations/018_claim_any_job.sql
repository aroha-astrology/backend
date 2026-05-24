-- Server-side queue drainer support.
-- Companion to 017_generation_queue.sql. The original claim_next_queue_job(p_user_id)
-- is for the old client-side worker; this variant drains across all users for the
-- service-role drain endpoint (apps/web/src/app/api/queue/drain/route.ts).
-- SKIP LOCKED makes it safe under concurrent invocations (cron + on-demand kick).

CREATE OR REPLACE FUNCTION claim_any_pending_job()
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
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING q.*;
END;
$$;

-- Restrict execute to service_role only — anon/authenticated should never call this.
REVOKE ALL ON FUNCTION claim_any_pending_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_any_pending_job() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_any_pending_job() TO service_role;
