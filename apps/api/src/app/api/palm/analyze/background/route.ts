import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { runPalmReading } from '@/lib/palm/runReading';
import type { ApiResponse } from '@aroha-astrology/shared';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Schema = z.object({
  readingId: z.string().uuid(),
});

/**
 * POST /api/palm/analyze/background
 * Thin wrapper — actual analysis lives in lib/palm/runReading.ts so the
 * server-side queue drain can run the same code path. Storage downloads
 * still need service-role, so we always pass admin client through.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = Schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const { readingId } = parsed.data;

    const admin = createAdminSupabase();
    const result = await runPalmReading(admin, user.id, readingId);

    if (!result.ok) {
      const status =
        result.error.code === 'reading_not_found' ? 404 :
        result.error.code === 'no_image' ? 400 :
        500;
      const messages = {
        reading_not_found: 'Reading not found',
        no_image: 'No image stored for this reading',
        download_failed: 'Image download failed',
        save_failed: 'Failed to save analysis',
      } as const;
      return NextResponse.json<ApiResponse>(
        { success: false, error: messages[result.error.code] },
        { status },
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { readingId, ...(result.skipped ? { skipped: true } : {}) },
    });
  } catch (err) {
    console.error('[palm/background]', err);
    return NextResponse.json<ApiResponse>({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
