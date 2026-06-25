-- ============================================================================
-- 004: Background report processing + Supabase Storage setup
-- ============================================================================

-- Add status tracking columns to generated_reports
ALTER TABLE generated_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Index for polling pending reports
CREATE INDEX IF NOT EXISTS idx_generated_reports_user_status
  ON generated_reports(user_id, status, created_at DESC);

-- Create storage bucket for PDFs (run this in the dashboard Storage UI too)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('reports', 'reports', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can only access their own reports folder
CREATE POLICY "reports_storage_user_access" ON storage.objects
  FOR ALL USING (
    bucket_id = 'reports' AND
    auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'reports' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
