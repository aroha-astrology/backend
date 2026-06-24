-- 023_palm_client_polylines.sql
--
-- Store client-computed hand-landmark polylines on palm_readings rows.
-- These are produced by MediaPipe Hand Landmarker on the user's device
-- (apps/web/src/lib/palm/handLandmarks.ts) at upload time, then merged
-- into the final analysis JSON by the server when the LLM stages finish.
--
-- Replaces the previous (unreliable) approach of asking the vision LLM
-- to output normalized polyline coordinates inline.

ALTER TABLE palm_readings
  ADD COLUMN IF NOT EXISTS client_polylines JSONB NULL;

COMMENT ON COLUMN palm_readings.client_polylines IS
  'MediaPipe-derived line traces from upload time. Shape: { heart, head, life, fate: Array<[number, number]> | null } in normalized 0-1 image coordinates. Server merges these into analysis.majorLines.*.polyline at persist time.';
