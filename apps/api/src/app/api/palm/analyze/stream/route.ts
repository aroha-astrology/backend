import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { deductCredits } from '@/lib/credits/deductCredits';
import { preparePalmImages } from '@/lib/compressImage';
import { streamPalmBedrock as streamPalm, mergeClientPolylines, type ClientPolylines, type Hand, type KundliContext } from '@/lib/palm/bedrockAnalysis';
import { generateHandMap } from '@/lib/palm/novaCanvas';
import { buildLifeContextForUser } from '@/lib/palm/lifeContext';
import { fetchKundliContext } from '@/lib/palm/kundliContext';

export const runtime = 'nodejs';
export const maxDuration = 300;

/* -------------------------------------------------------------------------- */
/*  POST /api/palm/analyze/stream                                             */
/*                                                                            */
/*  SSE endpoint that emits each of the three palm stages (lines / mounts /   */
/*  soul) as they resolve, then a final "done" frame with the persisted       */
/*  reading id and signed image URL. The web UI uses this for progressive     */
/*  rendering; mobile keeps using the blocking JSON endpoint for simplicity.  */
/* -------------------------------------------------------------------------- */

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];
const MAX_IMAGE_BYTES = 7_340_032;

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
});

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Palm reading (streaming)');
  if (!creditResult.success) {
    return new Response(JSON.stringify({ error: 'INSUFFICIENT_TOKENS' }), { status: 402, headers: { 'Content-Type': 'application/json' } });
  }

  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new Response(parsed.error.errors[0]?.message ?? 'Invalid request', { status: 400 });
  }
  const { imageBase64, hand, chartId, clientPolylines } = parsed.data;
  const handValue: Hand = (hand as Hand) ?? 'right';

  // Strip data: prefix if present
  let mediaType: AllowedMime = 'image/jpeg';
  let cleanBase64 = imageBase64;
  if (imageBase64.startsWith('data:')) {
    const match = imageBase64.match(/^data:(image\/[\w+.-]+);base64,/);
    if (match) {
      const detected = match[1];
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(detected)) {
        return new Response('Unsupported image type', { status: 400 });
      }
      mediaType = detected as AllowedMime;
      cleanBase64 = imageBase64.split(',')[1];
    }
  }

  const imageHash = crypto.createHash('sha256').update(cleanBase64).digest('hex');
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sse(event, data)));

      try {
        send('start', { hand: handValue });

        // Cache lookup ----------------------------------------------------
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
          const signedUrl = cached.image_path ? await issueSignedUrl(cached.image_path) : null;
          send('cached', { analysis: cached.analysis, imageUrl: signedUrl, readingId: cached.id });
          send('done', { readingId: cached.id, imageUrl: signedUrl, cached: true });
          controller.close();
          return;
        }

        // Preprocess ------------------------------------------------------
        send('progress', { step: 'preprocessing' });
        let color, enhanced;
        try {
          const out = await preparePalmImages(cleanBase64, mediaType);
          color = out.color;
          enhanced = out.enhanced;
        } catch {
          color = { data: cleanBase64, mediaType: 'image/jpeg' as const };
          enhanced = color;
        }

        // Kundli context (best-effort) -----------------------------------
        let kundli: KundliContext | undefined;
        try { kundli = await fetchKundliContext(supabase, user.id, chartId); } catch { /* ignore */ }

        // Life-context block (age + sector + tone + no-hallucination rules)
        let lifeContext = '';
        try { lifeContext = await buildLifeContextForUser(supabase, user.id); } catch { /* ignore */ }

        // Stream stages --------------------------------------------------
        const merged: Record<string, unknown> = { handType: handValue };
        for await (const part of streamPalm({ color, enhanced, hand: handValue, kundli, lifeContext })) {
          Object.assign(merged, part.data);
          send('stage', { stage: part.stage, data: part.data });
        }

        // Merge MediaPipe-derived polylines into majorLines.*.polyline.
        mergeClientPolylines(merged, clientPolylines as ClientPolylines | undefined);

        // Nova Canvas — generate perfected hand map (non-fatal)
        const novaPrompt = (merged as { novaCanvasPrompt?: string }).novaCanvasPrompt;
        let novaCanvasImageUrl: string | null = null;
        if (novaPrompt) {
          novaCanvasImageUrl = await generateHandMap(novaPrompt).catch(() => null);
          if (novaCanvasImageUrl) {
            send('stage', { stage: 'nova_canvas', data: { novaCanvasImageUrl } });
          }
        }

        // Upload original photo ------------------------------------------
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
          }
        } catch (err) {
          console.warn('[palm/stream] storage upload failed:', err);
        }

        // Persist --------------------------------------------------------
        const { data: reading, error: insertErr } = await supabase
          .from('palm_readings')
          .insert({
            user_id: user.id,
            image_url: signedUrl,
            image_path: imagePath,
            image_hash: imageHash,
            hand: handValue,
            analysis: merged,
            ...(novaCanvasImageUrl !== null ? { nova_canvas_image_url: novaCanvasImageUrl } : {}),
          })
          .select('id')
          .single();

        if (insertErr) {
          send('error', { message: `Failed to save reading: ${insertErr.message}` });
        } else {
          send('done', { readingId: reading.id, imageUrl: signedUrl, cached: false });
        }
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'Palm analysis failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
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
