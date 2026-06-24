export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAstrologer } from '@/lib/astrologers';

/**
 * POST /api/voice/tts
 * Body: { text: string, language?: string, gender?: 'male'|'female', strict?: boolean }
 *
 * Modes:
 * - strict: true   → ElevenLabs streaming ONLY (with one retry). No fallback to gTTS
 *                    or Edge TTS — voice calls cannot tolerate a mid-call voice swap.
 *                    On failure returns HTTP 503 with X-TTS-Source: none.
 * - strict: false  → ElevenLabs → Google Translate TTS → Edge TTS chain (legacy).
 *                    Used by text-mode chat and non-call audio.
 *
 * Always emits X-TTS-Source: elevenlabs | google | edge | none header so the client
 * can verify what was produced and refuse to play anything but ElevenLabs in a call.
 */

// Voice ID matrix: (astrologer-gender × user-language) → ElevenLabs voice.
// Each cell is env-overridable so per-astrologer cloned voices can be swapped in
// later without code changes (e.g. ELEVENLABS_VOICE_MALE_HI=<cloned-voice-id>).
//
// Defaults — Hindi-native professional voices from the user's ElevenLabs account.
// Both work with eleven_multilingual_v2 so they speak all 6 supported languages
// with an authentic Indian foundation:
//   Male all langs:   Krishna (XopCoWNooN3d7LfWZyX5) — sympathetic and natural
//   Female all langs: Monika Sogam (Ms9OTvWb99V6DwRHZn6q) — deep and clear
const ENV = (k: string) => (process.env[k]?.trim() || undefined);

// Languages with confirmed ElevenLabs eleven_turbo_v2_5 support.
// Other languages are shown as "Coming Soon" in the UI and blocked in strict (call) mode.
const VOICE_SUPPORTED_LANGS = ['en', 'hi', 'ta'];

const VOICE_MATRIX: Record<'male' | 'female', Record<string, string>> = {
  male: {
    en: ENV('ELEVENLABS_VOICE_MALE_EN') ?? ENV('ELEVENLABS_VOICE_EN') ?? 'XopCoWNooN3d7LfWZyX5', // Krishna
    hi: ENV('ELEVENLABS_VOICE_MALE_HI') ?? ENV('ELEVENLABS_VOICE_HI') ?? 'XopCoWNooN3d7LfWZyX5',
    ta: ENV('ELEVENLABS_VOICE_MALE_TA') ?? ENV('ELEVENLABS_VOICE_TA') ?? 'XopCoWNooN3d7LfWZyX5',
  },
  female: {
    en: ENV('ELEVENLABS_VOICE_FEMALE_EN') ?? 'Ms9OTvWb99V6DwRHZn6q', // Monika Sogam
    hi: ENV('ELEVENLABS_VOICE_FEMALE_HI') ?? 'Ms9OTvWb99V6DwRHZn6q',
    ta: ENV('ELEVENLABS_VOICE_FEMALE_TA') ?? 'Ms9OTvWb99V6DwRHZn6q',
  },
};

const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_turbo_v2_5';
const ELEVEN_DEADLINE_MS = 10_000; // raised from 6s — long Indic sentences sometimes brush past 6s
const ELEVEN_RETRY_BACKOFF_MS = 500;

const G_TTS_LANGS: Record<string, string> = {
  hi: 'hi', bn: 'bn', ta: 'ta', te: 'te', mr: 'mr', en: 'en',
};

// Edge TTS fallback voices — gender-matched Indian neural voices from Microsoft.
const EDGE_VOICES: Record<'male' | 'female', Record<string, string>> = {
  male: {
    hi: 'hi-IN-MadhurNeural',
    bn: 'bn-IN-BashkarNeural',
    ta: 'ta-IN-ValluvarNeural',
    te: 'te-IN-MohanNeural',
    mr: 'mr-IN-ManoharNeural',
    en: 'en-IN-PrabhatNeural',
  },
  female: {
    hi: 'hi-IN-SwaraNeural',
    bn: 'bn-IN-TanishaaNeural',
    ta: 'ta-IN-PallaviNeural',
    te: 'te-IN-ShrutiNeural',
    mr: 'mr-IN-AarohiNeural',
    en: 'en-IN-NeerjaNeural',
  },
};

const G_TTS_DEADLINE_MS = 4000;
const EDGE_TTS_DEADLINE_MS = 5000;

/**
 * Resolves the ElevenLabs voice ID for a given (astrologerId, gender, language).
 * Priority:
 *   1. Per-(astrologer × language) env override:  ELEVENLABS_VOICE_<ID>_<LANG>
 *   2. Per-astrologer env override:               ELEVENLABS_VOICE_<ID>
 *   3. The astrologer's own .voiceId field (from lib/astrologers.ts)
 *   4. Gender-keyed default from VOICE_MATRIX (legacy fallback)
 *
 * Astrologer IDs become env-var-safe by uppercasing and replacing '-' with '_'.
 * e.g. "yogi-baba" → "YOGI_BABA" → ELEVENLABS_VOICE_YOGI_BABA
 */
function resolveVoiceId(astrologerId: string | undefined, gender: 'male' | 'female', lang: string): string {
  if (astrologerId) {
    const envSafeId = astrologerId.toUpperCase().replace(/-/g, '_');
    const langSpecific = ENV(`ELEVENLABS_VOICE_${envSafeId}_${lang.toUpperCase()}`);
    if (langSpecific) return langSpecific;
    const astrologerWide = ENV(`ELEVENLABS_VOICE_${envSafeId}`);
    if (astrologerWide) return astrologerWide;
    const astrologer = getAstrologer(astrologerId);
    if (astrologer?.voiceId) return astrologer.voiceId;
  }
  const matrix = VOICE_MATRIX[gender] ?? VOICE_MATRIX.male;
  return matrix[lang] ?? matrix.en;
}

/**
 * Calls ElevenLabs streaming endpoint and returns the unconsumed Response so the
 * caller can pipe res.body straight to the client. Returns null on failure.
 */
async function elevenLabsStream(text: string, lang: string, gender: 'male' | 'female', astrologerId?: string): Promise<Response | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;

  const voiceId = resolveVoiceId(astrologerId, gender, lang);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ELEVEN_DEADLINE_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.85,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
      signal: controller.signal,
    });
    // Don't clear the timer here — keep it active so a stalled stream still aborts.
    // The client-side consumer will close the response when done.
    clearTimeout(timer);

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => res.statusText);
      console.warn('[TTS] ElevenLabs error', res.status, errText.slice(0, 200));
      return null;
    }
    return res;
  } catch (err) {
    clearTimeout(timer);
    console.warn('[TTS] ElevenLabs exception:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * ElevenLabs with one retry. 500ms backoff between attempts. Total budget:
 * up to ~20.5s in the worst case, which fits within the 30s maxDuration.
 */
async function elevenLabsStreamWithRetry(text: string, lang: string, gender: 'male' | 'female', astrologerId?: string): Promise<Response | null> {
  let res = await elevenLabsStream(text, lang, gender, astrologerId);
  if (res) return res;
  await new Promise(r => setTimeout(r, ELEVEN_RETRY_BACKOFF_MS));
  res = await elevenLabsStream(text, lang, gender, astrologerId);
  return res;
}

async function googleTTS(text: string, lang: string): Promise<Buffer | null> {
  try {
    const tl = G_TTS_LANGS[lang] ?? 'en';
    // Google Translate TTS has a ~200 char limit per request.
    const safeText = text.slice(0, 200);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(safeText)}&tl=${tl}&client=tw-ob`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), G_TTS_DEADLINE_MS);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length >= 200 ? buf : null;
  } catch (err) {
    console.warn('[TTS] gTTS error:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function edgeTTSImpl(text: string, lang: string, gender: 'male' | 'female'): Promise<Buffer | null> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const set = EDGE_VOICES[gender] ?? EDGE_VOICES.male;
  const voice = set[lang] ?? set.hi;
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const { audioStream: readable } = tts.toStream(text);
    readable.on('data', (chunk: Buffer) => chunks.push(chunk));
    readable.on('end', resolve);
    readable.on('error', reject);
  });

  return chunks.length > 0 ? Buffer.concat(chunks) : null;
}

async function edgeTTS(text: string, lang: string, gender: 'male' | 'female'): Promise<Buffer | null> {
  try {
    return await Promise.race([
      edgeTTSImpl(text, lang, gender),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), EDGE_TTS_DEADLINE_MS)
      ),
    ]);
  } catch (err) {
    console.warn('[TTS] Edge TTS error:', err instanceof Error ? err.message : err);
    return null;
  }
}

function bufferToResponse(audio: Buffer, source: 'google' | 'edge'): Response {
  return new Response(audio.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audio.length),
      'Cache-Control': 'no-store',
      'X-TTS-Source': source,
    },
  });
}

/**
 * Clean text before TTS synthesis.
 * - Removes parenthetical stage directions like (laughs softly), (nods gently) — ElevenLabs
 *   would read these as literal words instead of acting on them.
 * - Strips markdown formatting characters (* # - _) that ElevenLabs reads literally.
 * - Collapses extra whitespace.
 */
function cleanForTTS(raw: string): string {
  return raw
    // Remove parenthetical stage directions: (laughs softly), (smiling), etc.
    .replace(/\([^)]{1,60}\)/g, '')
    // Strip markdown bold/italic: **text** → text, *text* → text, _text_ → text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Strip markdown headers: ### text → text
    .replace(/^#{1,6}\s*/gm, '')
    // Strip bullet/list markers at line start: - item, * item, 1. item
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // Collapse multiple spaces/newlines into a single space
    .replace(/\s+/g, ' ')
    .trim();
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as {
      text?: string;
      language?: string;
      gender?: string;
      astrologerId?: string;
      strict?: boolean;
    };
    const text = cleanForTTS(body.text?.trim() ?? '');
    if (!text) return NextResponse.json({ error: 'No text' }, { status: 400 });

    // For mixed modes like "en+hi", use the native-language part for voice selection
    const rawLang = body.language ?? 'hi';
    const lang = rawLang.includes('+') ? rawLang.split('+')[1] : rawLang;
    const gender = body.gender === 'female' ? 'female' : 'male';
    const astrologerId = body.astrologerId;
    const strict = body.strict === true;

    // Block voice calls for languages without ElevenLabs support.
    // Text-chat TTS (non-strict) falls through to Edge TTS fallback.
    // For mixed modes, check both the raw code and the native part.
    if (!VOICE_SUPPORTED_LANGS.includes(rawLang) && !VOICE_SUPPORTED_LANGS.includes(lang) && strict) {
      return NextResponse.json(
        { error: 'voice_lang_not_supported', message: 'Voice call not available in this language yet — Coming Soon' },
        { status: 503, headers: { 'X-TTS-Source': 'none' } },
      );
    }

    // 1. ElevenLabs streaming (with retry). The ONLY voice source allowed in a
    // live voice call — fallbacks below produce different voices and would break
    // the illusion of speaking with one astrologer.
    const elevenRes = await elevenLabsStreamWithRetry(text, lang, gender, astrologerId);
    if (elevenRes && elevenRes.body) {
      return new Response(elevenRes.body, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-store',
          'X-TTS-Source': 'elevenlabs',
        },
      });
    }

    // Strict mode (voice call): never fall back. The client will skip this
    // sentence's audio rather than substitute a different voice.
    if (strict) {
      return NextResponse.json(
        { error: 'tts_unavailable' },
        { status: 503, headers: { 'X-TTS-Source': 'none' } },
      );
    }

    // 2. Google Translate TTS (non-strict only).
    let audio = await googleTTS(text, lang);
    if (audio) return bufferToResponse(audio, 'google');

    // 3. Microsoft Edge TTS (non-strict only).
    audio = await edgeTTS(text, lang, gender);
    if (audio) return bufferToResponse(audio, 'edge');

    return NextResponse.json(
      { error: 'TTS service not available' },
      { status: 503, headers: { 'X-TTS-Source': 'none' } },
    );

  } catch (err) {
    console.error('[TTS] Error:', err);
    return NextResponse.json(
      { error: 'TTS failed' },
      { status: 503, headers: { 'X-TTS-Source': 'none' } },
    );
  }
}
