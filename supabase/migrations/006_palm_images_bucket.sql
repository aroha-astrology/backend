-- ============================================================================
-- 006: Palm images storage bucket
-- ============================================================================
-- Private bucket holding the original palm photo a user uploaded for analysis.
-- Files are written via the service role from the API route; users read them
-- through short-lived signed URLs returned by /api/palm/analyze.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('palm-images', 'palm-images', false)
ON CONFLICT (id) DO NOTHING;

-- Owners can read their own files (defence-in-depth — primary path is signed URLs).
DROP POLICY IF EXISTS "palm_images_owner_read" ON storage.objects;
CREATE POLICY "palm_images_owner_read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'palm-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- No client-side writes; service role bypasses RLS for INSERT/UPDATE/DELETE.

-- ----------------------------------------------------------------------------
-- palm_readings: track the storage path and a content hash so we can
-- (a) re-issue signed URLs without re-uploading and
-- (b) skip the AI call when the same user re-submits an identical photo.
-- ----------------------------------------------------------------------------
ALTER TABLE palm_readings
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS image_hash text;

CREATE INDEX IF NOT EXISTS idx_palm_readings_user_hash
  ON palm_readings (user_id, image_hash, hand);
