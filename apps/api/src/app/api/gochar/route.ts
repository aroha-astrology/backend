export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { deductCredits } from '@/lib/credits/deductCredits';
import type { ApiResponse } from '@aroha-astrology/shared';

// Average daily motion in degrees for each planet (used to estimate next sign change)
const AVG_DAILY_SPEED: Record<string, number> = {
  Sun: 0.9856,
  Moon: 13.176,
  Mars: 0.524,
  Mercury: 1.383,
  Jupiter: 0.0831,
  Venus: 1.2,
  Saturn: 0.0335,
  Rahu: 0.053,
  Ketu: 0.053,
};

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Gochar (transit) analysis');
    if (!creditResult.success) {
      return NextResponse.json({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }

    // Dynamic import to avoid webpack bundling swisseph-wasm at compile time
    const { dateToJulianDay, calculatePlanetPositions } = await import('@aroha-astrology/astro-engine');

    const now = new Date();
    const jd = await dateToJulianDay(
      now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
      now.getUTCHours(), now.getUTCMinutes(), 0
    );

    // Calculate current planet positions with Lahiri ayanamsa
    const planets = await calculatePlanetPositions(jd, 'lahiri');

    // Calculate approximate next sign changes
    const nextSignChanges = planets.map((p: { planet: string; sign: string; signDegree: number }) => {
      const degreesLeft = 30 - (p.signDegree ?? 0);
      const speed = AVG_DAILY_SPEED[p.planet] ?? 1;
      const daysUntil = Math.round(degreesLeft / speed);
      const changeDate = new Date(now.getTime() + daysUntil * 86400000);
      const currentSignIdx = SIGNS.indexOf(p.sign);
      const nextSign = SIGNS[(currentSignIdx + 1) % 12];
      return {
        planet: p.planet,
        daysUntil,
        nextSign,
        approxDate: changeDate.toISOString().slice(0, 10),
      };
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        planets,
        calculatedAt: now.toISOString(),
        nextSignChanges,
      },
    });
  } catch (error) {
    console.error('Gochar calculation error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to calculate transits' },
      { status: 500 },
    );
  }
}
