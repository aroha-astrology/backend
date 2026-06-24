export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import type { ApiResponse } from '@aroha-astrology/shared';

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;
type Sign = (typeof SIGNS)[number];

const SATURN_CACHE_KEY = (yyyymmdd: string) => `transit:saturn:lahiri:${yyyymmdd}`;
const SATURN_CACHE_TTL = 12 * 3600;

export async function GET(request: NextRequest) {
  const moonSign = request.nextUrl.searchParams.get('moonSign');
  if (!moonSign || !(SIGNS as readonly string[]).includes(moonSign)) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'moonSign query param is required (Aries..Pisces)' },
      { status: 400 },
    );
  }

  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);

  let saturnLongitude = await cacheGet<number>(SATURN_CACHE_KEY(dayKey));

  if (saturnLongitude == null) {
    const { dateToJulianDay, calculatePlanetPositions } = await import('@aroha-astrology/astro-engine');
    const jd = await dateToJulianDay(
      now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
      now.getUTCHours(), now.getUTCMinutes(), 0,
    );
    const planets = (await calculatePlanetPositions(jd, 'lahiri')) as Array<{
      planet: string; longitude: number;
    }>;
    saturnLongitude = planets.find((p) => p.planet === 'Saturn')?.longitude ?? 0;
    await cacheSet(SATURN_CACHE_KEY(dayKey), saturnLongitude, SATURN_CACHE_TTL);
  }

  const { detectSadeSati } = await import('@aroha-astrology/astro-engine');
  const result = detectSadeSati(moonSign as Sign, saturnLongitude);

  return NextResponse.json<ApiResponse>({
    success: true,
    data: {
      ...result,
      saturnLongitude,
      computedAt: now.toISOString(),
    },
  });
}
