export const runtime = 'nodejs';
export const maxDuration = 60;

// Called by Colab worker after AI content is saved to Supabase.
// Only renders the PDF — fast (<30s).

import { NextResponse, after } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { KundliReport } from '@/components/pdf/KundliReport';
import type { KundliReportData } from '@/components/pdf/KundliReport';
import { buildGroundTruth } from '@/lib/ai/groundTruth';
import type { GroundTruthInput } from '@/lib/ai/groundTruth';
import { sendPushToUser } from '@/lib/push/send';
import { createNotification } from '@/lib/notifications/create';
import { notifyReportReady } from '@/lib/telegram';

const WESTERN_ZODIAC = [
  { sign: 'Capricorn', s: 1, sd: 1, e: 1, ed: 19 }, { sign: 'Aquarius', s: 1, sd: 20, e: 2, ed: 18 },
  { sign: 'Pisces', s: 2, sd: 19, e: 3, ed: 20 }, { sign: 'Aries', s: 3, sd: 21, e: 4, ed: 19 },
  { sign: 'Taurus', s: 4, sd: 20, e: 5, ed: 20 }, { sign: 'Gemini', s: 5, sd: 21, e: 6, ed: 20 },
  { sign: 'Cancer', s: 6, sd: 21, e: 7, ed: 22 }, { sign: 'Leo', s: 7, sd: 23, e: 8, ed: 22 },
  { sign: 'Virgo', s: 8, sd: 23, e: 9, ed: 22 }, { sign: 'Libra', s: 9, sd: 23, e: 10, ed: 22 },
  { sign: 'Scorpio', s: 10, sd: 23, e: 11, ed: 21 }, { sign: 'Sagittarius', s: 11, sd: 22, e: 12, ed: 21 },
  { sign: 'Capricorn', s: 12, sd: 22, e: 12, ed: 31 },
];

function safe(val: unknown, fallback = ''): string {
  if (val === null || val === undefined || val === '') return fallback;
  return String(val) || fallback;
}

// REPORTS_DISABLED: PDF rendering temporarily disabled.
export async function POST(_request: Request) {
  return NextResponse.json(
    { success: false, error: 'Report rendering is temporarily disabled.' },
    { status: 503 },
  );
}

/* REPORTS_DISABLED_START
export async function POST(request: Request) {
  const internalKey = request.headers.get('x-internal-key');
  const expectedKey = process.env.INTERNAL_PROCESS_KEY;
  if (!expectedKey || internalKey !== expectedKey) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  let reportId = '';

  try {
    const body = await request.json() as { report_id: string };
    reportId = body.report_id;

    const { data: report } = await supabase
      .from('generated_reports')
      .select('metadata, subject_name, subject_dob, subject_gender, user_id, ai_content, report_type')
      .eq('id', reportId)
      .single();

    if (!report) throw new Error('Report not found');

    const { metadata, subject_name: name, subject_dob: dob, subject_gender: gender, user_id: userId, ai_content, report_type: reportType } = report as {
      metadata: Record<string, unknown>; subject_name: string; subject_dob: string;
      subject_gender: string; user_id: string; ai_content: Record<string, string>; report_type: string;
    };

    const chartData = metadata.chartData as Record<string, unknown>;
    const dashaData = metadata.dashaData as Record<string, unknown>;
    const yogaData = metadata.yogaData as Array<Record<string, unknown>>;
    const doshaData = metadata.doshaData as Record<string, unknown>;
    const shadbala = metadata.shadbala as Record<string, unknown>;
    const ashtakavarga = metadata.ashtakavarga as Record<string, unknown>;
    const profileData = metadata.profileData as Record<string, unknown>;

    const planets = (chartData?.planets ?? []) as Array<Record<string, unknown>>;
    const houses = (chartData?.houses ?? []) as Array<Record<string, unknown>>;
    const ascendant = (chartData?.ascendant ?? {}) as Record<string, unknown>;

    const gtInput: GroundTruthInput = {
      name, dob,
      tob: safe(profileData?.tob),
      pob: safe(profileData?.pob),
      gender,
      chartData: {
        planets: planets.map(p => ({
          name: String(p.planet ?? p.name ?? ''),
          sign: String(p.sign ?? ''),
          degree: Number(p.signDegree ?? p.degree ?? 0),
          nakshatra: String(p.nakshatra ?? ''),
          pada: Number(p.nakshatraPada ?? p.pada ?? 0),
          house: Number(p.house ?? 0),
          isRetrograde: Boolean(p.isRetrograde),
        })),
        houses: houses.map(h => ({
          house: Number(h.house ?? 0),
          sign: String(h.sign ?? ''),
          lord: String(h.lord ?? ''),
        })),
        ascendant: {
          sign: String(ascendant.sign ?? ''),
          degree: Number(ascendant.degree ?? 0),
          lord: String(ascendant.lord ?? ''),
        },
      },
      dashaData: dashaData ?? {},
      yogaData: yogaData ?? [],
      doshaData: doshaData ?? {},
      shadbala: shadbala ?? {},
      ashtakavarga: ashtakavarga ?? {},
    };

    const groundTruth = buildGroundTruth(gtInput);

    const dobDate = new Date(dob + 'T00:00:00Z');
    const m = dobDate.getUTCMonth() + 1;
    const d = dobDate.getUTCDate();
    const westernZodiac = WESTERN_ZODIAC.find(z =>
      (m === z.s && d >= z.sd) || (m === z.e && d <= z.ed)
    )?.sign ?? 'Aries';

    const avatarUrl = typeof metadata.avatarUrl === 'string' ? metadata.avatarUrl : undefined;

    const reportData: KundliReportData = {
      name, dob,
      tob: safe(profileData?.tob),
      pob: safe(profileData?.pob),
      gender: gender as 'male' | 'female',
      chartData: gtInput.chartData,
      dashaData: dashaData ?? {},
      yogaData: yogaData ?? [],
      doshaData: doshaData ?? {},
      shadbala: shadbala ?? {},
      ashtakavarga: ashtakavarga ?? {},
      westernZodiac,
      groundTruth,
      aiContent: ai_content ?? {},
      avatarUrl,
    };

    console.log(`[render] Rendering PDF for report ${reportId}...`);
    const pdfBuffer = await renderToBuffer(
      createElement(KundliReport, { data: reportData }) as Parameters<typeof renderToBuffer>[0],
    );

    const storageKey = `${userId}/${reportId}_kundli.pdf`;
    await supabase.storage.from('reports').upload(storageKey, pdfBuffer, {
      contentType: 'application/pdf', upsert: true,
    });

    const { data: signed } = await supabase.storage
      .from('reports')
      .createSignedUrl(storageKey, 60 * 60 * 24 * 365);

    await supabase.from('generated_reports').update({
      status: 'ready',
      pdf_url: signed?.signedUrl ?? null,
    }).eq('id', reportId);

    console.log(`[render] Done — report ${reportId} is ready`);

    try {
      const { data: { user: reportUser } } = await supabase.auth.admin.getUserById(userId);
      await notifyReportReady(name, reportType ?? 'Kundli', reportUser?.email ?? userId);
    } catch { // non-critical
    }

    const reportLink = `/reports/premium?reportId=${reportId}`;
    const notifTitle = `${name}'s full analysis is live`;
    const notifBody = `Deep chart analysis is now live across every screen — Career, Dasha, Marriage, Health, and more are all at full power.`;

    try {
      await sendPushToUser(userId, {
        title: notifTitle,
        body: notifBody,
        url: reportLink,
        tag: `report-${reportId}`,
      });
    } catch (pushErr) {
      console.error('[render] push send failed:', pushErr);
    }

    await createNotification({
      userId,
      type: 'report_ready',
      title: notifTitle,
      body: notifBody,
      link: reportLink,
      metadata: { report_id: reportId, subject_name: name },
    });

    // Opportunistically generate a divisional chart analysis while the LLM is free
    after(async () => {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        await fetch(`${appUrl}/api/divisional-charts/auto-generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-key': process.env.INTERNAL_PROCESS_KEY ?? '',
          },
        });
      } catch (e) {
        console.error('[render] divisional auto-generate failed:', e);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[render] Error:', error);
    if (reportId) {
      await supabase.from('generated_reports').update({
        status: 'error',
        error_message: error instanceof Error ? error.message : String(error),
      }).eq('id', reportId);
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
REPORTS_DISABLED_END */
