import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { deductCredits } from '@/lib/credits/deductCredits';
import type { ApiResponse } from '@aroha-astrology/shared';
import { z } from 'zod';
import { preparePalmImages } from '@/lib/compressImage';
import { analyzePalmBedrock as analyzePalm, mergeClientPolylines, type ClientPolylines, type Hand, type KundliContext } from '@/lib/palm/bedrockAnalysis';
import { generateHandMap } from '@/lib/palm/novaCanvas';
import { fetchKundliContext } from '@/lib/palm/kundliContext';
import { buildLifeContextForUser } from '@/lib/palm/lifeContext';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

const MAX_IMAGE_BYTES = 7_340_032; // ~5 MB image after base64 overhead

const ClientPolylinesSchema = z
  .object({
    heart: z.array(z.tuple([z.number(), z.number()])).nullable().optional(),
    head: z.array(z.tuple([z.number(), z.number()])).nullable().optional(),
    life: z.array(z.tuple([z.number(), z.number()])).nullable().optional(),
    fate: z.array(z.tuple([z.number(), z.number()])).nullable().optional(),
  })
  .optional();

const PalmSchema = z.object({
  imageBase64: z.string().min(1, 'imageBase64 is required').max(MAX_IMAGE_BYTES, 'Image exceeds 5 MB limit'),
  hand: z.enum(['left', 'right']).optional(),
  chartId: z.string().uuid().optional(),
  clientPolylines: ClientPolylinesSchema,
});

export const maxDuration = 300;

/* -------------------------------------------------------------------------- */
/*  POST /api/palm/analyze                                                    */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Palm reading analysis');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }

    const parsed = PalmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const { imageBase64, hand, chartId, clientPolylines } = parsed.data;
    const handValue: Hand = (hand as Hand) ?? 'right';

    /* ------------------------------ extract bytes ----------------------- */
    let mediaType: AllowedMime = 'image/jpeg';
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
        mediaType = detected as AllowedMime;
        cleanBase64 = imageBase64.split(',')[1];
      }
    }

    /* ------------------------------ hash + cache ------------------------ */
    const imageHash = crypto.createHash('sha256').update(cleanBase64).digest('hex');
    const { data: cached } = await supabase
      .from('palm_readings')
      .select('id, image_path, analysis')
      .eq('user_id', user.id)
      .eq('image_hash', imageHash)
      .eq('hand', handValue)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.analysis) {
      const signedUrl = cached.image_path
        ? (await issueSignedUrl(cached.image_path)) ?? null
        : null;
      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          readingId: cached.id,
          hand: handValue,
          analysis: cached.analysis,
          imageUrl: signedUrl,
          cached: true,
        },
      });
    }

    /* ------------------------------ preprocess + kundli (parallel) ------ */
    const [prepResult, kundliResult] = await Promise.allSettled([
      preparePalmImages(cleanBase64, mediaType),
      fetchKundliContext(supabase, user.id, chartId),
    ]);

    let color, enhanced;
    if (prepResult.status === 'fulfilled') {
      color = prepResult.value.color;
      enhanced = prepResult.value.enhanced;
    } else {
      console.warn('[palm/analyze] preprocessing failed, falling back to original:', prepResult.reason);
      color = { data: cleanBase64, mediaType: 'image/jpeg' as const };
      enhanced = color;
    }

    let kundli: KundliContext | undefined;
    if (kundliResult.status === 'fulfilled') {
      kundli = kundliResult.value;
    } else {
      console.warn('[palm/analyze] kundli context lookup failed:', kundliResult.reason);
    }

    // Life-context block (age + sector + tone + no-hallucination rules) — best-effort.
    let lifeContext = '';
    try {
      lifeContext = await buildLifeContextForUser(supabase, user.id);
    } catch (e) {
      console.warn('[palm/analyze] life-context lookup failed (non-fatal):', e);
    }

    /* ------------------------------ analyze ----------------------------- */
    const analysis = await analyzePalm({ color, enhanced, hand: handValue, kundli, lifeContext });
    mergeClientPolylines(analysis, clientPolylines as ClientPolylines | undefined);

    // Nova Canvas — generate perfected hand map (non-fatal)
    const novaPrompt = (analysis as { novaCanvasPrompt?: string }).novaCanvasPrompt;
    let novaCanvasImageUrl: string | null = null;
    if (novaPrompt) {
      novaCanvasImageUrl = await generateHandMap(novaPrompt).catch(() => null);
    }

    /* ------------------------------ upload original --------------------- */
    let imagePath: string | null = null;
    let signedUrl: string | null = null;
    try {
      const admin = createAdminSupabase();
      const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg';
      const path = `${user.id}/${Date.now()}_${handValue}.${ext}`;
      const buffer = Buffer.from(cleanBase64, 'base64');
      const upload = await admin.storage
        .from('palm-images')
        .upload(path, buffer, { contentType: mediaType, upsert: false });
      if (!upload.error) {
        imagePath = path;
        const signed = await admin.storage
          .from('palm-images')
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        signedUrl = signed.data?.signedUrl ?? null;
      } else {
        console.warn('[palm/analyze] storage upload failed:', upload.error);
      }
    } catch (err) {
      console.warn('[palm/analyze] storage upload threw:', err);
    }

    /* ------------------------------ persist ----------------------------- */
    const { data: reading, error: readError } = await supabase
      .from('palm_readings')
      .insert({
        user_id: user.id,
        image_url: signedUrl,
        image_path: imagePath,
        image_hash: imageHash,
        hand: handValue,
        analysis,
        ...(novaCanvasImageUrl !== null ? { nova_canvas_image_url: novaCanvasImageUrl } : {}),
      })
      .select()
      .single();

    if (readError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to store palm reading: ${readError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        readingId: reading.id,
        hand: handValue,
        analysis,
        imageUrl: signedUrl,
        novaCanvasImageUrl,
        cached: false,
      },
    });
  } catch (error) {
    console.error('Palm analysis error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to analyze palm' },
      { status: 500 },
    );
  }
}

async function issueSignedUrl(path: string): Promise<string | null> {
  try {
    const admin = createAdminSupabase();
    const signed = await admin.storage.from('palm-images').createSignedUrl(path, 60 * 60 * 24 * 365);
    return signed.data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
