#!/usr/bin/env tsx
/**
 * One-shot generator: pre-record "thinking" filler phrases per (voice_id, language)
 * using ElevenLabs, save MP3s to apps/web/public/audio/fillers/{voiceId}/{lang}/filler-{n}.mp3.
 *
 * Phase B: filler folders are keyed by the ElevenLabs voice_id, not by gender.
 * Each astrologer's persona declares a voiceId in lib/astrologers.ts — astrologers
 * that share a voice (e.g. Yogi Baba + Rishi Arjun both use Krishna) share the same
 * filler folder, so we never duplicate MP3s.
 *
 * Usage:
 *   npx tsx scripts/generate-voice-fillers.ts                                     # all unique voices × all langs, missing only
 *   npx tsx scripts/generate-voice-fillers.ts --force                             # regenerate everything
 *   npx tsx scripts/generate-voice-fillers.ts --voice XopCoWNooN3d7LfWZyX5        # one voice only
 *   npx tsx scripts/generate-voice-fillers.ts --voice K24eC7JpUgk8zMtQYrpV --lang hi --force
 *
 * Required env (in apps/web/.env.local):
 *   ELEVENLABS_API_KEY
 * Optional:
 *   ELEVENLABS_MODEL (default: eleven_turbo_v2_5)
 */

import * as dotenv from 'dotenv';
import { resolve, join } from 'path';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { ASTROLOGERS } from '../apps/web/src/lib/astrologers';

dotenv.config({ path: resolve(__dirname, '../apps/web/.env.local') });

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_turbo_v2_5';

const FORCE = process.argv.includes('--force');
const LANG_FLAG_IDX = process.argv.indexOf('--lang');
const LANG_FILTER = LANG_FLAG_IDX >= 0 ? process.argv[LANG_FLAG_IDX + 1] : null;
const VOICE_FLAG_IDX = process.argv.indexOf('--voice');
const VOICE_FILTER = VOICE_FLAG_IDX >= 0 ? process.argv[VOICE_FLAG_IDX + 1] : null;

const OUT_ROOT = resolve(__dirname, '../apps/web/public/audio/fillers');

const FILLERS: Record<string, string[]> = {
  en: [
    'Let me look at your chart carefully...',
    'Hmm, your planetary positions tell an interesting story.',
    'Just a moment, I am checking your dasha period.',
    'The stars are revealing something important here.',
    'Let me consult the ancient texts on this.',
    'I see, your birth chart has some unique placements.',
    'Give me a moment to study this properly.',
    'Yes, I am observing the houses now.',
  ],
  hi: [
    'एक क्षण रुकिए, मैं आपकी कुंडली देख रहा हूँ।',
    'हम्म, आपके ग्रहों की स्थिति बहुत दिलचस्प है।',
    'मैं आपकी दशा का अध्ययन कर रहा हूँ।',
    'तारे कुछ महत्वपूर्ण बता रहे हैं।',
    'एक पल दीजिए, मैं इसे ध्यान से देख रहा हूँ।',
    'हाँ, आपकी जन्म कुंडली में विशेष योग हैं।',
    'मुझे एक क्षण दीजिए, इसे समझने दीजिए।',
    'देखिए, ग्रह कुछ कह रहे हैं।',
  ],
  ta: [
    'ஒரு கணம் பொறுங்கள், நான் உங்கள் ஜாதகத்தைப் பார்க்கிறேன்.',
    'ஹ்ம், உங்கள் கிரக நிலை சுவாரஸ்யமாக உள்ளது.',
    'உங்கள் தசையை நான் ஆய்வு செய்கிறேன்.',
    'நட்சத்திரங்கள் ஏதோ முக்கியமானதைச் சொல்கின்றன.',
    'ஒரு கணம், நான் இதை ஆழமாகப் பார்க்கிறேன்.',
    'ஆம், உங்கள் ஜாதகத்தில் சிறப்பு யோகங்கள் உள்ளன.',
    'நான் வீடுகளை இப்போது கவனிக்கிறேன்.',
    'சற்று நேரம் தாருங்கள், நான் படிக்கிறேன்.',
  ],
  bn: [
    'এক মুহূর্ত অপেক্ষা করুন, আমি আপনার কুণ্ডলী দেখছি।',
    'হুম, আপনার গ্রহের অবস্থান বেশ আকর্ষণীয়।',
    'আমি আপনার দশা অধ্যয়ন করছি।',
    'তারারা কিছু গুরুত্বপূর্ণ বলছে।',
    'এক মুহূর্ত দিন, আমি মনোযোগ দিচ্ছি।',
    'হ্যাঁ, আপনার জন্মকুণ্ডলীতে বিশেষ যোগ আছে।',
    'আমি এখন ঘরগুলো পর্যবেক্ষণ করছি।',
    'একটু সময় দিন, আমি বিশ্লেষণ করছি।',
  ],
  te: [
    'ఒక క్షణం ఆగండి, నేను మీ జాతకాన్ని చూస్తున్నాను.',
    'హ్మ్, మీ గ్రహాల స్థానం ఆసక్తికరంగా ఉంది.',
    'నేను మీ దశను అధ్యయనం చేస్తున్నాను.',
    'నక్షత్రాలు ఏదో ముఖ్యమైనది చెబుతున్నాయి.',
    'ఒక క్షణం ఇవ్వండి, నేను శ్రద్ధగా చూస్తున్నాను.',
    'అవును, మీ జన్మ జాతకంలో ప్రత్యేక యోగాలు ఉన్నాయి.',
    'నేను ఇప్పుడు ఇళ్లను గమనిస్తున్నాను.',
    'కొంచెం సమయం ఇవ్వండి, నేను అధ్యయనం చేస్తున్నాను.',
  ],
  mr: [
    'एक क्षण थांबा, मी तुमची कुंडली पाहत आहे.',
    'हम्म, तुमच्या ग्रहांची स्थिती मनोरंजक आहे.',
    'मी तुमची दशा अभ्यासत आहे.',
    'तारे काहीतरी महत्त्वाचे सांगत आहेत.',
    'एक क्षण द्या, मी लक्षपूर्वक पाहत आहे.',
    'होय, तुमच्या जन्म कुंडलीत विशेष योग आहेत.',
    'मी आता घरांचे निरीक्षण करत आहे.',
    'थोडा वेळ द्या, मी अभ्यास करत आहे.',
  ],
};

if (!ELEVENLABS_API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY in apps/web/.env.local — get one at https://elevenlabs.io/app/settings/api-keys');
  process.exit(1);
}

async function generateOne(text: string, voiceId: string): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY!,
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
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`ElevenLabs ${res.status}: ${errText.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  // Unique voice IDs derived from the astrologer config — so adding a new
  // astrologer or swapping a voice in lib/astrologers.ts auto-extends this script.
  const allVoiceIds = Array.from(new Set(ASTROLOGERS.map(a => a.voiceId)));
  const voiceIds = VOICE_FILTER ? [VOICE_FILTER] : allVoiceIds;
  const langs = LANG_FILTER ? [LANG_FILTER] : Object.keys(FILLERS);
  let totalGenerated = 0;
  let totalSkipped = 0;

  for (const voiceId of voiceIds) {
    const usedBy = ASTROLOGERS.filter(a => a.voiceId === voiceId).map(a => a.name).join(', ');
    for (const lang of langs) {
      const phrases = FILLERS[lang];
      if (!phrases) {
        console.warn(`No filler phrases defined for "${lang}", skipping.`);
        continue;
      }
      const outDir = join(OUT_ROOT, voiceId, lang);
      mkdirSync(outDir, { recursive: true });

      console.log(`\n[${voiceId}/${lang}] used by: ${usedBy || '(no astrologer)'} (${phrases.length} phrases)`);

      for (let i = 0; i < phrases.length; i++) {
        const num = String(i + 1).padStart(2, '0');
        const outPath = join(outDir, `filler-${num}.mp3`);

        if (!FORCE && existsSync(outPath)) {
          console.log(`  - filler-${num}.mp3 — exists, skipping`);
          totalSkipped++;
          continue;
        }

        try {
          const buf = await generateOne(phrases[i], voiceId);
          writeFileSync(outPath, buf);
          console.log(`  + filler-${num}.mp3 (${(buf.length / 1024).toFixed(1)} KB) "${phrases[i].slice(0, 50)}..."`);
          totalGenerated++;
        } catch (err) {
          console.error(`  ! filler-${num}.mp3 FAILED: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }

  console.log(`\nDone. Generated: ${totalGenerated}, Skipped: ${totalSkipped}.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
