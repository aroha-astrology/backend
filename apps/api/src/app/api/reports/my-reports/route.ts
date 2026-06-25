import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 300; // 10 minutes

// DELETE /api/reports/my-reports?status=pending,generating
// Bulk-delete reports by status for the authenticated user
export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const statuses = (url.searchParams.get('status') ?? 'pending,generating').split(',').map(s => s.trim());

  const { error, count } = await supabase
    .from('generated_reports')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
    .in('status', statuses);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deleted: count ?? 0 });
}

// GET /api/reports/my-reports
// Returns all generated_reports for the authenticated user, newest first
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('generated_reports')
    .select('id, report_type, subject_name, subject_dob, subject_gender, metadata, pdf_filename, pdf_url, status, error_message, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}
