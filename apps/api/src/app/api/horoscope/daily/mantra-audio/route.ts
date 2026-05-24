import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

// Default voice — Krishna (XopCoWNooN3d7LfWZyX5), calm & resonant, works for Sanskrit mantras
const MANTRA_VOICE_ID = process.env.ELEVENLABS_VOICE_MALE_EN ?? 'XopCoWNooN3d7LfWZyX5';
const MODEL_ID = process.env.ELEVENLABS_MODEL ?? 'eleven_turbo_v2_5';
const BUCKET = 'mantra-audio';

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rashi = searchParams.get('rashi')?.trim();
  const date  = searchParams.get('date')?.trim();   // YYYY-MM-DD
  const lang  = searchParams.get('lang')?.trim() || 'en';

  if (!rashi || !date) {
    return NextResponse.json({ error: 'Missing rashi or date' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rashiTitle = capitalise(rashi);

  // 1. Check if audio URL already cached in DB
  const { data: row } = await supabase
    .from('daily_horoscopes')
    .select('content')
    .eq('rashi', rashiTitle)
    .eq('date', date)
    .eq('language', lang)
    .single();

  const content = row?.content as Record<string, unknown> | null;

  if (content?.remedy_mantra_audio_url) {
    return NextResponse.json({ url: content.remedy_mantra_audio_url });
  }

  const mantraText = content?.remedy_mantra as string | undefined;
  if (!mantraText?.trim()) {
    return NextResponse.json({ error: 'No mantra for this rashi/date' }, { status: 404 });
  }

  // 2. Generate audio via ElevenLabs
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 503 });
  }

  let audioBuffer: Buffer;
  try {
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${MANTRA_VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: mantraText,
          model_id: MODEL_ID,
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.85,
            style: 0.25,
            use_speaker_boost: true,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!elevenRes.ok) {
      const err = await elevenRes.text();
      console.error('[mantra-audio] ElevenLabs error', elevenRes.status, err);
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 502 });
    }

    audioBuffer = Buffer.from(await elevenRes.arrayBuffer());
  } catch (err) {
    console.error('[mantra-audio] ElevenLabs fetch failed', err);
    return NextResponse.json({ error: 'TTS request failed' }, { status: 502 });
  }

  // 3. Upload to Supabase Storage (mantra-audio bucket, remedy/ prefix)
  const admin = createAdminSupabase();
  const storagePath = `remedy/${rashiTitle}/${date}-${lang}.mp3`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, audioBuffer, {
      contentType: 'audio/mpeg',
      cacheControl: '604800', // 7 days
      upsert: true,
    });

  if (uploadErr) {
    console.error('[mantra-audio] upload error', uploadErr);
    return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath);
  const audioUrl = pub.publicUrl;

  // 4. Cache URL back into daily_horoscopes content JSONB
  await admin
    .from('daily_horoscopes')
    .update({ content: { ...(content ?? {}), remedy_mantra_audio_url: audioUrl } })
    .eq('rashi', rashiTitle)
    .eq('date', date)
    .eq('language', lang);

  return NextResponse.json({ url: audioUrl });
}
