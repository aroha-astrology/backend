import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { deductCredits } from '@/lib/credits/deductCredits';
import { enqueueJob } from '@/lib/queue';
import { kickDrain } from '@/lib/queue/kick';
import type { ApiResponse } from '@aroha-astrology/shared';
import { z } from 'zod';

export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 7_340_032;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const ClientPolylinesSchema = z
  .object({
    heart: z.array(z.tuple([z.number(), z.number()])).nullable().optional(),
    head: z.array(z.tuple([z.number(), z.number()])).nullable().optional(),
    life: z.array(z.tuple([z.number(), z.number()])).nullable().optional(),
    fate: z.array(z.tuple([z.number(), z.number()])).nullable().optional(),
  })
  .optional();

const Schema = z.object({
  imageBase64: z.string().min(1).max(MAX_IMAGE_BYTES),
  hand: z.enum(['left', 'right']).optional(),
  chartId: z.string().uuid().optional(),
  clientPolylines: ClientPolylinesSchema,
  reportDepth: z.enum(['basic', 'full', 'ultra']).optional(),
  language: z.string().max(40).optional(),
});

/**
 * POST /api/palm/enqueue
 * Upload palm image + insert a pending palm_readings row + enqueue background job.
 * Returns immediately so the user can navigate away.
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
    const { imageBase64, hand, chartId, clientPolylines, reportDepth, language } = parsed.data;
    const handValue = (hand ?? 'right') as 'left' | 'right';

    // Strip data-URI prefix
    let mediaType: string = 'image/jpeg';
    let cleanBase64 = imageBase64;
    if (imageBase64.startsWith('data:')) {
      const match = imageBase64.match(/^data:(image\/[\w+.-]+);base64,/);
      if (match) {
        const detected = match[1];
        if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(detected)) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: 'Unsupported image type. Use JPEG, PNG, WebP, or GIF.' },
            { status: 400 },
          );
        }
        mediaType = detected;
        cleanBase64 = imageBase64.split(',')[1];
      }
    }

    // Cache check — if identical image+hand already analyzed, return existing reading
    const imageHash = crypto.createHash('sha256').update(cleanBase64).digest('hex');
    const { data: cached } = await supabase
      .from('palm_readings')
      .select('id, analysis')
      .eq('user_id', user.id)
      .eq('image_hash', imageHash)
      .eq('hand', handValue)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.analysis) {
      return NextResponse.json<ApiResponse>({
        success: true,
        data: { readingId: cached.id, enqueued: false, cached: true },
      });
    }

    // Enforce per-user 3-attempt cap.  Cached replays above already returned and
    // don't count against this; only genuinely new attempts can hit the limit.
    const { count: attemptCount } = await supabase
      .from('palm_readings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    const MAX_PALM_READINGS = 3;
    if ((attemptCount ?? 0) >= MAX_PALM_READINGS) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'PALM_READING_LIMIT_REACHED' },
        { status: 429 },
      );
    }

    // Deduct credits before doing any work
    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Palm reading analysis');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }

    // Upload image to storage
    const admin = createAdminSupabase();
    const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg';
    const imagePath = `${user.id}/${Date.now()}_${handValue}.${ext}`;
    const buffer = Buffer.from(cleanBase64, 'base64');
    const { error: uploadError } = await admin.storage
      .from('palm-images')
      .upload(imagePath, buffer, { contentType: mediaType, upsert: false });
    if (uploadError) {
      console.error('[palm/enqueue] storage upload failed:', uploadError);
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Image upload failed' },
        { status: 500 },
      );
    }

    // Insert pending reading row (analysis = null means "processing").
    // client_polylines comes from MediaPipe Hand Landmarker run on the user's
    // device — the background worker reads + merges it when LLM analysis lands.
    const { data: reading, error: insertError } = await supabase
      .from('palm_readings')
      .insert({
        user_id: user.id,
        image_path: imagePath,
        image_hash: imageHash,
        hand: handValue,
        analysis: null,
        client_polylines: clientPolylines ?? null,
      })
      .select('id')
      .single();

    if (insertError || !reading) {
      console.error('[palm/enqueue] insert failed:', insertError);
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Failed to create reading record' },
        { status: 500 },
      );
    }

    // Enqueue background job
    await enqueueJob(
      supabase,
      user.id,
      'palm_reading',
      {
        reading_id: reading.id,
        hand: handValue,
        chart_id: chartId ?? null,
        report_depth: reportDepth ?? 'full',
        language: language ?? 'English',
      },
      5, // higher priority than life_journey defaults
    );

    void kickDrain(request);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { readingId: reading.id, enqueued: true, cached: false },
    });
  } catch (err) {
    console.error('[palm/enqueue]', err);
    return NextResponse.json<ApiResponse>({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
