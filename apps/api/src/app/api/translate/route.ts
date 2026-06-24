import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getAvailableAPIKeys, fetchWithKeyFallback } from '@/lib/ai/aiProvider';

export const runtime = 'nodejs';
export const maxDuration = 30;

const LANGUAGE_NAMES: Record<string, string> = {
  hi: 'Hindi',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  mr: 'Marathi',
  gu: 'Gujarati',
  kn: 'Kannada',
  ml: 'Malayalam',
  pa: 'Punjabi',
  or: 'Odia',
  as: 'Assamese',
  ur: 'Urdu',
  ne: 'Nepali',
  sa: 'Sanskrit',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese (Simplified)',
  ar: 'Arabic',
};

function buildPrompt(texts: string[], languageName: string): string {
  const numbered = texts.map((t, i) => `[${i}] ${t}`).join('\n');
  return `Translate each of the numbered UI strings below into ${languageName}.

STRICT RULES:
- Output ONLY the translations, one line per item, with the SAME [index] prefix.
- Do NOT add commentary, explanations, headings, quotes, or any extra text.
- Preserve numbers, dates, emojis, and inline punctuation.
- Use natural ${languageName} script (not Latin transliteration).
- If an item is a brand name or already in ${languageName}, return it unchanged.
- The number of output lines must equal the number of input lines.

Input:
${numbered}

Output:`;
}

function parseResponse(raw: string, count: number): string[] {
  const out: string[] = new Array(count).fill('');
  const lines = raw.split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*\[(\d+)\]\s*(.*?)\s*$/);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    if (idx >= 0 && idx < count) {
      out[idx] = m[2];
    }
  }
  return out;
}

async function callNIMRaw(prompt: string, languageName: string, startIdx = 0): Promise<string> {
  const keys = getAvailableAPIKeys();
  if (!keys.length) throw new Error('No NVIDIA NIM API key configured');
  const model = process.env.NVIDIA_NIM_MODEL ?? 'mistralai/mistral-nemotron';

  return fetchWithKeyFallback(keys, async (apiKey) => {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a precise translation engine. Translate UI strings from English into ${languageName}. Reply with the translations only, in the exact numbered-line format requested. No preamble, no explanation, no astrology, no extra text.`,
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 4096,
        temperature: 0.2,
        stream: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      const err = new Error(`NIM ${res.status}: ${errText}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as { choices?: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content ?? '';
  }, 'translate', startIdx);
}

function isSaneTranslation(source: string, translation: string): boolean {
  if (!translation || translation.trim().length === 0) return false;
  // Sanity check: translated text shouldn't be > 4x the source length (NIM garbage guard)
  if (translation.length > source.length * 4 + 20) return false;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const texts: unknown = body.texts;
    const targetLang: unknown = body.targetLang;

    if (!Array.isArray(texts) || typeof targetLang !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid payload: { texts: string[], targetLang: string }' },
        { status: 400 },
      );
    }

    const stringTexts = (texts as unknown[]).map((t) => (typeof t === 'string' ? t : ''));
    if (stringTexts.length === 0) {
      return NextResponse.json({ success: true, translations: [] });
    }
    if (targetLang === 'en') {
      return NextResponse.json({ success: true, translations: stringTexts });
    }

    const languageName = LANGUAGE_NAMES[targetLang] ?? targetLang;
    const supabase = createAdminSupabase();

    // ── Step 1: DB cache lookup ───────────────────────────────────────────────
    const uniqueTexts = [...new Set(stringTexts.filter(Boolean))];
    const { data: cachedRows } = await supabase
      .from('translations_cache')
      .select('source_text, translated_text')
      .eq('target_lang', targetLang)
      .in('source_text', uniqueTexts);

    const dbHits = new Map<string, string>(
      (cachedRows ?? []).map((r) => [r.source_text, r.translated_text]),
    );

    // ── Step 2: identify misses ───────────────────────────────────────────────
    const misses = uniqueTexts.filter((t) => !dbHits.has(t));

    // ── Step 3: call NIM for misses ───────────────────────────────────────────
    if (misses.length > 0) {
      const nimResults = new Map<string, string>();
      const CHUNK = 20;
      const chunks: string[][] = [];
      for (let i = 0; i < misses.length; i += CHUNK) chunks.push(misses.slice(i, i + CHUNK));

      // Stripe parallel batches across NIM keys: batch k starts on key
      // (k mod #keys). Without this, every parallel batch hammers key 0,
      // throttling it and cascading 504s through the pool sequentially.
      const settled = await Promise.allSettled(
        chunks.map((slice, k) => callNIMRaw(buildPrompt(slice, languageName), languageName, k)),
      );

      settled.forEach((r, k) => {
        if (r.status !== 'fulfilled') {
          console.error('[translate] NIM batch failed', r.reason);
          return;
        }
        const slice = chunks[k];
        const parsed = parseResponse(r.value, slice.length);
        for (let j = 0; j < slice.length; j++) {
          const t = parsed[j];
          if (isSaneTranslation(slice[j], t)) {
            nimResults.set(slice[j], t);
          }
        }
      });

      // ── Step 4: write NIM results to DB cache ─────────────────────────────
      const toInsert = Array.from(nimResults.entries()).map(([source_text, translated_text]) => ({
        source_text,
        target_lang: targetLang,
        translated_text,
      }));
      if (toInsert.length > 0) {
        await supabase
          .from('translations_cache')
          .upsert(toInsert, { onConflict: 'source_text,target_lang', ignoreDuplicates: true });
      }

      // Merge NIM results into the hits map
      for (const [k, v] of nimResults) {
        dbHits.set(k, v);
      }
    }

    // ── Step 5: assemble result in original order ─────────────────────────────
    const translations = stringTexts.map((t) => dbHits.get(t) ?? t);

    return NextResponse.json({ success: true, translations });
  } catch (error) {
    console.error('[translate] error', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Translation failed' },
      { status: 500 },
    );
  }
}
