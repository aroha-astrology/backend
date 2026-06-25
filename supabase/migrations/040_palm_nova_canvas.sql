-- Add nova_canvas_image_url to palm_readings for the Bedrock-generated
-- "perfected hand map" image. NULL for all existing rows and for any
-- reading where Nova Canvas generation fails or is skipped.
ALTER TABLE palm_readings
  ADD COLUMN IF NOT EXISTS nova_canvas_image_url text;
