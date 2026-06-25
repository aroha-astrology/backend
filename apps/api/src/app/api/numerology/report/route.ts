import { NextResponse, after } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { z } from 'zod';
// astro-engine loaded dynamically to avoid swisseph-wasm webpack bundling

export const runtime = 'nodejs';

// Immediately returns a report_id and fires background processing.
// The heavy AI + PDF work is done in /api/numerology/report/process.
export const maxDuration = 30;

// Palm + extended-profile fields were removed when the form was dropped in
// favour of profile-driven auto-generation. The schema is intentionally
// minimal — only the values we can derive from a saved birth_profiles row.
const NumerologyReportSchema = z.object({
  name:        z.string().min(1).max(100),
  dob:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dob must be YYYY-MM-DD'),
  gender:      z.enum(['male', 'female']),
  birthCity:   z.string().max(200).optional(),
  currentCity: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const { calculateMulank, calculateBhagyank, calculateLoShuGrid, calculateChallengeNumbers, generateMonthlyForecast, getZodiacSign, getNamePlanes, getKuaData, calculateSoulUrge, calculatePersonality, analyzeNameNumerology } = await import('@aroha-astrology/astro-engine');
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    // Profile guard: the auto-generate flow assumes the user has at least one
    // birth profile. Bail early with a clear error so the client can route
    // them to onboarding instead of burning a credit on an empty report.
    const { data: profileRow } = await supabase
      .from('birth_profiles')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (!profileRow) {
      return NextResponse.json({ success: false, error: 'No birth profile found. Complete onboarding first.' }, { status: 400 });
    }

    const { deductCredits } = await import('@/lib/credits/deductCredits');
    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Numerology report');
    if (!creditResult.success) {
      return NextResponse.json({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }

    const parsed = NumerologyReportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    const { name, dob, gender, birthCity, currentCity } = parsed.data;
    const dobDate = new Date(dob + 'T00:00:00Z');

    // Run deterministic calculations (fast — no AI needed)
    const mulank = calculateMulank(dobDate);
    const bhagyank = calculateBhagyank(dobDate);
    const kua = getKuaData(dobDate.getUTCFullYear(), gender);
    const zodiac = getZodiacSign(dobDate);
    const loShuGrid = calculateLoShuGrid(dobDate);
    const challengeNumbers = calculateChallengeNumbers(dobDate);
    const soulUrge = calculateSoulUrge(name);
    const personality = calculatePersonality(name);
    const nameNumbers = analyzeNameNumerology(name);
    const namePlanes = getNamePlanes(name);
    const now = new Date();
    const monthlyForecast = generateMonthlyForecast(dobDate, now.getUTCFullYear(), now.getUTCMonth() + 1);

    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
    const pdfFilename = `numerology-report-${safeName}.pdf`;

    // Save pending record to DB
    const { data: savedReport, error: saveError } = await supabase
      .from('generated_reports')
      .insert({
        user_id: user.id,
        report_type: 'numerology',
        subject_name: name,
        subject_dob: dob,
        subject_gender: gender,
        status: 'pending',
        pdf_filename: pdfFilename,
        metadata: {
          mulank, bhagyank, kua, zodiac, loShuGrid, challengeNumbers,
          soulUrge, personality, nameNumber: nameNumbers.chaldean, namePlanes, monthlyForecast,
          birthCity: birthCity ?? null,
          currentCity: currentCity ?? null,
          // Form-derived fields no longer collected — defaults keep the
          // process-route prompts happy without biasing the output. Marital
          // status of 'unspecified' resolves to no marital-specific branch.
          maritalStatus: 'unspecified',
          concern: 'overall',
          occupation: null,
        },
        ai_content: {},
      })
      .select('id')
      .single();

    if (saveError || !savedReport) {
      return NextResponse.json({ success: false, error: 'Failed to create report record' }, { status: 500 });
    }

    const reportId = savedReport.id as string;

    // Fire background processor (fire and forget — do NOT await)
    const processKey = process.env.INTERNAL_PROCESS_KEY;
    if (!processKey) {
      console.error('[numerology/report] INTERNAL_PROCESS_KEY not set — report pending but not triggered');
    } else {
      const baseUrl = new URL(request.url).origin;
      after(async () => {
        try {
          const res = await fetch(`${baseUrl}/api/numerology/report/process`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-key': processKey,
            },
            body: JSON.stringify({ report_id: reportId, user_id: user.id }),
          });
          if (!res.ok) {
            console.error('[numerology/report] /process returned', res.status, await res.text());
          }
        } catch (err) {
          console.error('[numerology/report] Failed to trigger process:', err);
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: { report_id: reportId, status: 'pending' },
      message: 'Report generation started. Check your Profile page when it is ready.',
    });
  } catch (error) {
    console.error('Numerology report start error:', error);
    return NextResponse.json({ success: false, error: 'Failed to start report generation' }, { status: 500 });
  }
}
