import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { createServerSupabase } from '@/lib/supabase/server';
import { NumerologyReport } from '@/components/pdf/NumerologyReport';
import type { NumerologyReportData } from '@/components/pdf/NumerologyReport';

// POST /api/numerology/report/regenerate
// Body: { report_id }
// Fetches stored AI content from generated_reports and re-renders the PDF
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { report_id } = await request.json() as { report_id: string };
    if (!report_id) return NextResponse.json({ error: 'report_id is required' }, { status: 400 });

    const { data: report, error } = await supabase
      .from('generated_reports')
      .select('subject_name, subject_dob, subject_gender, metadata, ai_content, pdf_filename')
      .eq('id', report_id)
      .eq('user_id', user.id)
      .single();

    if (error || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const reportData = {
      ...(report.metadata as Omit<NumerologyReportData, 'aiContent'>),
      name: report.subject_name,
      dob: report.subject_dob,
      gender: report.subject_gender as 'male' | 'female',
      aiContent: report.ai_content as NumerologyReportData['aiContent'],
    } as NumerologyReportData;

    const pdfBuffer = await renderToBuffer(
      createElement(NumerologyReport, { data: reportData }) as Parameters<typeof renderToBuffer>[0],
    );
    const filename = report.pdf_filename ?? `numerology-report-${report.subject_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[numerology/report/regenerate] error:', err);
    return NextResponse.json({ error: 'Failed to regenerate report' }, { status: 500 });
  }
}
