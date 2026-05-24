-- Auto-unlock chat when all queue jobs for a user finish.
-- Replaces the external webhook with an in-database trigger — no HTTP call needed.

CREATE OR REPLACE FUNCTION unlock_chat_if_queue_clear()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending INT;
  v_generating INT;
BEGIN
  -- Only act when a job moves into a terminal state
  IF NEW.status NOT IN ('done', 'failed', 'skipped') THEN
    RETURN NEW;
  END IF;

  -- Any other open jobs for this user?
  SELECT COUNT(*) INTO v_pending
  FROM generation_queue
  WHERE user_id = NEW.user_id
    AND status IN ('pending', 'processing')
    AND id <> NEW.id;

  IF v_pending > 0 THEN
    RETURN NEW;
  END IF;

  -- Any reports still mid-generation?
  SELECT COUNT(*) INTO v_generating
  FROM generated_reports
  WHERE user_id = NEW.user_id
    AND status = 'generating';

  IF v_generating > 0 THEN
    RETURN NEW;
  END IF;

  -- All clear — unlock chat for every chart owned by this user
  UPDATE kundli_charts
  SET chat_ready = TRUE
  WHERE user_id = NEW.user_id
    AND chat_ready = FALSE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unlock_chat_on_queue_complete ON generation_queue;
CREATE TRIGGER trg_unlock_chat_on_queue_complete
AFTER UPDATE OF status ON generation_queue
FOR EACH ROW
WHEN (NEW.status IN ('done', 'failed', 'skipped'))
EXECUTE FUNCTION unlock_chat_if_queue_clear();

-- Mirror trigger: a report finishing should also unlock chat if queue is empty
CREATE OR REPLACE FUNCTION unlock_chat_on_report_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending INT;
  v_other_generating INT;
BEGIN
  IF NEW.status = 'generating' OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_pending
  FROM generation_queue
  WHERE user_id = NEW.user_id
    AND status IN ('pending', 'processing');

  SELECT COUNT(*) INTO v_other_generating
  FROM generated_reports
  WHERE user_id = NEW.user_id
    AND status = 'generating'
    AND id <> NEW.id;

  IF v_pending = 0 AND v_other_generating = 0 THEN
    UPDATE kundli_charts
    SET chat_ready = TRUE
    WHERE user_id = NEW.user_id
      AND chat_ready = FALSE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unlock_chat_on_report_complete ON generated_reports;
CREATE TRIGGER trg_unlock_chat_on_report_complete
AFTER UPDATE OF status ON generated_reports
FOR EACH ROW
EXECUTE FUNCTION unlock_chat_on_report_complete();
