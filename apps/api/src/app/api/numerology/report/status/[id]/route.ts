import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

// GET /api/numerology/report/status/[id]
// Polls the status of a background numerology report
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('generated_reports')
    .select('id, status, pdf_url, error_message, subject_name, pdf_filename')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  // Normalise: the DB column is 'complete' but the frontend uses 'ready'
  const status = data.status === 'complete' ? 'ready' : data.status;

  return NextResponse.json({
    data: {
      id: data.id,
      status,
      download_url: data.pdf_url ?? null,
      error_message: data.error_message ?? null,
    },
  });
}
