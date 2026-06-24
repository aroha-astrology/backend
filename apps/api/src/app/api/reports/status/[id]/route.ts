import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('generated_reports')
    .select('status, pdf_url, error_message, report_type, metadata, subject_name')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!data) return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });

  // During generation, error_message holds progress like "3/7"
  let progress: string | null = null;
  if (data.status === 'generating' && data.error_message && /^\d+\/\d+$/.test(data.error_message)) {
    progress = data.error_message;
  }

  const meta = (data.metadata ?? {}) as { chartId?: string; profileId?: string; tier?: string };

  return NextResponse.json({
    success: true,
    data: {
      status: data.status,
      download_url: data.pdf_url ?? null,
      error: data.status === 'error' ? (data.error_message ?? null) : null,
      progress,
      report_type: data.report_type ?? null,
      tier: meta.tier ?? (typeof data.report_type === 'string' && data.report_type.startsWith('kundli_') ? data.report_type.replace('kundli_', '') : null),
      chart_id: meta.chartId ?? null,
      profile_id: meta.profileId ?? null,
      subject_name: data.subject_name ?? null,
    },
  });
}
