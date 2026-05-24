#!/usr/bin/env tsx
/**
 * One-shot generator: for every row in `public.mantras` missing an audio_url,
 * call Sarvam AI Bulbul TTS, upload the WAV to the `mantra-audio` Storage
 * bucket, and write the public URL + duration back to the row.
 *
 * Usage:
 *   npx tsx scripts/generate-mantra-audio.ts          # only fills missing
 *   npx tsx scripts/generate-mantra-audio.ts --force  # regenerate all
 *
 * Required env (in apps/web/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SARVAM_API_KEY
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../apps/web/.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SARVAM_API_KEY = process.env.SARVAM_API_KEY!;
const FORCE = process.argv.includes('--force');
const VOICE_FLAG_IDX = process.argv.indexOf('--voice');
const VOICE_OVERRIDE = VOICE_FLAG_IDX >= 0 ? process.argv[VOICE_FLAG_IDX + 1] : null;
// Default: "vijay" — mature male voice, fits the elder-priest tone for mantras.
// Other male options to try: ashutosh, anand, kabir, ratan, gokul, abhilash.
// Swap any time via:  npx tsx scripts/generate-mantra-audio.ts --voice kabir --force
const DEFAULT_SPEAKER = 'vijay';
const SPEAKER = VOICE_OVERRIDE ?? DEFAULT_SPEAKER;
const BUCKET = 'mantra-audio';
const SARVAM_URL = 'https://api.sarvam.ai/text-to-speech';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local');
  process.exit(1);
}
if (!SARVAM_API_KEY) {
  console.error('Missing SARVAM_API_KEY in apps/web/.env.local — get one at https://dashboard.sarvam.ai');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface MantraRow {
  key: string;
  name: string;
  mantra_text: string;
  audio_url: string | null;
}

interface SarvamResponse {
  audios?: string[];
  request_id?: string;
}

const SAMPLE_RATE = 22050;

async function callSarvam(text: string): Promise<Buffer> {
  const res = await fetch(SARVAM_URL, {
    method: 'POST',
    headers: {
      'api-subscription-key': SARVAM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: 'hi-IN',
      speaker: SPEAKER,
      pace: 0.80,
      speech_sample_rate: SAMPLE_RATE,
      enable_preprocessing: true,
      // bulbul:v3 has the full voice catalog including mature male voices
      // (vijay, ashutosh, anand, kabir, ratan, gokul…). v2 is limited to 7.
      // v3 does not accept pitch/loudness params.
      model: 'bulbul:v3',
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Sarvam TTS failed (${res.status}): ${errBody}`);
  }

  const json = (await res.json()) as SarvamResponse;
  const base64 = json.audios?.[0];
  if (!base64) throw new Error(`Sarvam returned no audio for input: ${text}`);
  return Buffer.from(base64, 'base64');
}

function estimateWavDurationMs(buf: Buffer): number {
  if (buf.length < 44) return 0;
  const dataSize = buf.readUInt32LE(40);
  const byteRate = buf.readUInt32LE(28);
  if (byteRate === 0) return 0;
  return Math.round((dataSize / byteRate) * 1000);
}

async function processMantra(row: MantraRow) {
  if (row.audio_url && !FORCE) {
    console.log(`  · ${row.key.padEnd(10)} skipped (already generated)`);
    return 'skipped' as const;
  }

  console.log(`  · ${row.key.padEnd(10)} generating "${row.mantra_text}"…`);
  const wav = await callSarvam(row.mantra_text);
  const durationMs = estimateWavDurationMs(wav);
  const path = `${row.key}.wav`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, wav, {
      contentType: 'audio/wav',
      cacheControl: '604800',
      upsert: true,
    });
  if (uploadErr) throw new Error(`Upload failed for ${row.key}: ${uploadErr.message}`);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { error: updateErr } = await supabase
    .from('mantras')
    .update({
      audio_url: pub.publicUrl,
      audio_duration_ms: durationMs,
      updated_at: new Date().toISOString(),
    })
    .eq('key', row.key);
  if (updateErr) throw new Error(`DB update failed for ${row.key}: ${updateErr.message}`);

  console.log(`    ↳ uploaded ${wav.length}B, ${durationMs}ms → ${pub.publicUrl}`);
  return 'generated' as const;
}

async function main() {
  console.log(`Fetching mantras (force=${FORCE}, speaker=${SPEAKER})…`);
  const { data, error } = await supabase
    .from('mantras')
    .select('key,name,mantra_text,audio_url')
    .order('sort_order');
  if (error) throw error;

  const rows = (data ?? []) as MantraRow[];
  console.log(`Found ${rows.length} mantras\n`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await processMantra(row);
      if (result === 'skipped') skipped++;
      else ok++;
    } catch (err) {
      failed++;
      console.error(`  ✗ ${row.key}: ${(err as Error).message}`);
    }
  }

  console.log(`\nDone. generated=${ok} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
