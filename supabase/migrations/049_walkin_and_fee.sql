-- Migration 049: Add in_person kind to interaction_log + fee tracking

-- Widen the kind check constraint to include 'in_person'
ALTER TABLE interaction_log
  DROP CONSTRAINT IF EXISTS interaction_log_kind_check;

ALTER TABLE interaction_log
  ADD CONSTRAINT interaction_log_kind_check
  CHECK (kind IN ('call','whatsapp','message','note','ai_consultation','in_person'));

-- Add fee_rs column for recording cash/UPI fees collected during in-person sessions
ALTER TABLE interaction_log
  ADD COLUMN IF NOT EXISTS fee_rs integer;
