import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzePalmBedrock, mergeClientPolylines, type ClientPolylines, type Hand, type KundliContext, type ReportDepth } from '@/lib/palm/bedrockAnalysis';
import { fetchKundliContext } from '@/lib/palm/kundliContext';
import { preparePalmImages, highlightPalmLines } from '@/lib/compressImage';
import { createNotification } from '@/lib/notifications/create';
import { sendPushToUser } from '@/lib/push/send';
import { buildLifeContextForUser } from '@/lib/palm/lifeContext';
import { generateHandMap } from '@/lib/palm/novaCanvas';

export type ReadingError =
  | { code: 'reading_not_found' }
  | { code: 'no_image' }
  | { code: 'download_failed' }
  | { code: 'save_failed' };

/**
 * Run palm-image LLM analysis for a single pending palm_readings row.
 * Idempotent — if `analysis` is already populated, returns skipped=true.
 *
 * Caller must use a Supabase client with permission to read/update the row
 * AND read from the palm-images storage bucket. The drain endpoint passes
 * service-role; the API route passes the authenticated user's client.
 */
export async function runPalmReading(
  supabase: SupabaseClient,
  userId: string,
  readingId: string,
  opts?: { reportDepth?: ReportDepth; language?: string },
): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: ReadingError }> {
  const { data: row, error: fetchError } = await supabase
    .from('palm_readings')
    .select('id, image_path, hand, analysis, client_polylines, user_id')
    .eq('id', readingId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !row) return { ok: false, error: { code: 'reading_not_found' } };

  if (row.analysis) return { ok: true, skipped: true };

  if (!row.image_path) return { ok: false, error: { code: 'no_image' } };

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('palm-images')
    .download(row.image_path as string);

  if (downloadError || !fileData) {
    console.error('[palm/run] download failed:', downloadError);
    return { ok: false, error: { code: 'download_failed' } };
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const cleanBase64 = Buffer.from(arrayBuffer).toString('base64');
  const handValue = (row.hand ?? 'right') as Hand;

  const [prepResult, kundliResult, lifeCtxResult, highlightResult] = await Promise.allSettled([
    preparePalmImages(cleanBase64, 'image/jpeg'),
    fetchKundliContext(supabase, userId, undefined),
    buildLifeContextForUser(supabase, userId),
    highlightPalmLines(cleanBase64),
  ]);

  let color, enhanced;
  if (prepResult.status === 'fulfilled') {
    color = prepResult.value.color;
    enhanced = prepResult.value.enhanced;
  } else {
    console.warn('[palm/run] preprocessing failed:', prepResult.reason);
    color = { data: cleanBase64, mediaType: 'image/jpeg' as const };
    enhanced = color;
  }

  const lineHighlighted = highlightResult.status === 'fulfilled' ? highlightResult.value : undefined;
  if (highlightResult.status === 'rejected') {
    console.warn('[palm/run] line highlight failed (non-fatal):', highlightResult.reason);
  }

  let kundli: KundliContext | undefined;
  if (kundliResult.status === 'fulfilled') {
    kundli = kundliResult.value;
  }

  const lifeContext =
    lifeCtxResult.status === 'fulfilled' ? lifeCtxResult.value : '';

  const analysis = await analyzePalmBedrock({
    color, enhanced, lineHighlighted, hand: handValue, kundli, lifeContext,
    reportDepth: opts?.reportDepth ?? 'full',
    language: opts?.language ?? 'English',
  });
  mergeClientPolylines(analysis, (row.client_polylines ?? null) as ClientPolylines | null);

  // Nova Canvas — generate perfected hand map (non-fatal)
  const novaPrompt = (analysis as { novaCanvasPrompt?: string }).novaCanvasPrompt;
  let novaCanvasImageUrl: string | null = null;
  if (novaPrompt) {
    novaCanvasImageUrl = await generateHandMap(novaPrompt).catch(() => null);
  }

  let imageUrl: string | null = null;
  try {
    const signed = await supabase.storage
      .from('palm-images')
      .createSignedUrl(row.image_path as string, 60 * 60 * 24 * 365);
    imageUrl = signed.data?.signedUrl ?? null;
  } catch {
    // Non-fatal
  }

  const { error: updateError } = await supabase
    .from('palm_readings')
    .update({
      analysis,
      image_url: imageUrl,
      ...(novaCanvasImageUrl !== null ? { nova_canvas_image_url: novaCanvasImageUrl } : {}),
    })
    .eq('id', readingId)
    .eq('user_id', userId);

  if (updateError) {
    console.error('[palm/run] update failed:', updateError);
    return { ok: false, error: { code: 'save_failed' } };
  }

  await createNotification({
    userId,
    type: 'palm_reading_ready',
    title: 'Your palm reading is ready!',
    body: 'Pandit Hastamani Shastri has decoded your hand. Tap to see your reading.',
    link: `/palm/${readingId}`,
    metadata: { reading_id: readingId },
  });

  // Fire push (web + native) so users get notified even when the app isn't open.
  // Best-effort: never block the reading completion if push fails.
  void sendPushToUser(userId, {
    title: 'Your palm reading is ready 🪷',
    body: 'Pandit Hastamani Shastri has decoded your hand. Tap to see your reading.',
    url: `/palm/${readingId}`,
    route: `/palm/${readingId}`,
    tag: `palm-${readingId}`,
  }).catch((err) => {
    console.warn('[palm/run] push send failed (non-fatal):', err);
  });

  return { ok: true };
}
