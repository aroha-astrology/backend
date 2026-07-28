// =============================================================================
// Yoga/dosha name+description translation — unlike every other translate-on-
// read consumer in this codebase (horoscope, house-insight, vastu, reports),
// this content has NO LLM call anywhere in its generation path: yogas/doshas
// are deterministic astro-engine rule output (see
// src/lib/astro-engine/yogas/, src/lib/astro-engine/doshas/). Translation is
// therefore a standalone, second-stage LLM call over already-computed English
// text, same "translate on read, cache forever" shape as the other modules.
//
// Only a small, explicit allowlist of leaf fields is ever sent to or accepted
// back from the model — every structural/enum/numeric field (type, present,
// strength, planets, houses, activationPeriod, severity, percentage,
// fromLagna/fromMoon/fromVenus, marsHouseFrom*, rahuHouse, ketuHouse,
// isPartial, active, phase, startDate, endDate, saturnSign, moonSign, house)
// is copied byte-for-byte from the original and never passes through the
// model at all — the same discipline horoscope.ts's
// restoreNonTranslatableFields exists to enforce after the fact, applied here
// up front instead.
// =============================================================================

import { generate } from './gemini-client.js';
import { KUNDLI_CONTENT_TRANSLATION_PROFILE } from '../../config/llm.js';
import { cleanJsonString } from './horoscope.js';
import type { Yoga } from '@aroha-astrology/shared';

export interface KundliContent {
  yogas: Yoga[];
  doshas: Record<string, unknown>;
}

interface TranslatableYogaEntry {
  index: number;
  name: string;
  description: string;
}

interface TranslatableDoshas {
  mangal?: { description: string; cancellations?: string[] };
  kaalSarp?: { name: string; description: string };
  sadeSati?: { description: string };
  pitra?: { description: string; indicators?: string[] };
  kemDruma?: { description: string; cancellations?: string[] };
  grahan?: { description: string };
  guruChandal?: { description: string };
}

interface TranslatablePayload {
  yogas: TranslatableYogaEntry[];
  doshas: TranslatableDoshas;
}

/** Only translates PRESENT yogas — absent ones are never shown to the user (see YogaCard.tsx's `present` filter), so translating their text would be pure wasted tokens. All 7 dosha slots are extracted unconditionally (a small, fixed-shape object) whenever they carry a description. */
function extractTranslatable(content: KundliContent): TranslatablePayload {
  const yogas: TranslatableYogaEntry[] = content.yogas
    .map((y, index) => ({ y, index }))
    .filter(({ y }) => y.present && y.description)
    .map(({ y, index }) => ({ index, name: y.name, description: y.description }));

  const d = content.doshas as Record<string, Record<string, unknown> | undefined>;
  const doshas: TranslatableDoshas = {};

  const mangal = d.mangal;
  if (mangal && typeof mangal.description === 'string') {
    const cancellations = Array.isArray(mangal.cancellations)
      ? (mangal.cancellations as string[])
      : [];
    doshas.mangal = {
      description: mangal.description,
      ...(cancellations.length ? { cancellations } : {}),
    };
  }
  const kaalSarp = d.kaalSarp;
  if (kaalSarp && typeof kaalSarp.description === 'string') {
    doshas.kaalSarp = { name: String(kaalSarp.name ?? ''), description: kaalSarp.description };
  }
  const sadeSati = d.sadeSati;
  if (sadeSati && typeof sadeSati.description === 'string') {
    doshas.sadeSati = { description: sadeSati.description };
  }
  const pitra = d.pitra;
  if (pitra && typeof pitra.description === 'string') {
    const indicators = Array.isArray(pitra.indicators) ? (pitra.indicators as string[]) : [];
    doshas.pitra = { description: pitra.description, ...(indicators.length ? { indicators } : {}) };
  }
  const kemDruma = d.kemDruma;
  if (kemDruma && typeof kemDruma.description === 'string') {
    const cancellations = Array.isArray(kemDruma.cancellations)
      ? (kemDruma.cancellations as string[])
      : [];
    doshas.kemDruma = {
      description: kemDruma.description,
      ...(cancellations.length ? { cancellations } : {}),
    };
  }
  const grahan = d.grahan;
  if (grahan && typeof grahan.description === 'string') {
    doshas.grahan = { description: grahan.description };
  }
  const guruChandal = d.guruChandal;
  if (guruChandal && typeof guruChandal.description === 'string') {
    doshas.guruChandal = { description: guruChandal.description };
  }

  return { yogas, doshas };
}

/** Splices ONLY the allowlisted translated leaves back onto a deep copy of `content` — every other field is untouched, regardless of what the model returns. */
function spliceTranslated(content: KundliContent, translated: TranslatablePayload): KundliContent {
  const yogas = content.yogas.map((y, index) => {
    const t = translated.yogas.find((ty) => ty.index === index);
    if (!t) return y;
    return { ...y, name: t.name || y.name, description: t.description || y.description };
  });

  const d = content.doshas as Record<string, Record<string, unknown> | undefined>;
  const td = translated.doshas ?? {};
  const doshas: Record<string, unknown> = { ...d };

  if (td.mangal && d.mangal) {
    doshas.mangal = {
      ...d.mangal,
      description: td.mangal.description || d.mangal.description,
      ...(td.mangal.cancellations ? { cancellations: td.mangal.cancellations } : {}),
    };
  }
  if (td.kaalSarp && d.kaalSarp) {
    doshas.kaalSarp = {
      ...d.kaalSarp,
      name: td.kaalSarp.name || d.kaalSarp.name,
      description: td.kaalSarp.description || d.kaalSarp.description,
    };
  }
  if (td.sadeSati && d.sadeSati) {
    doshas.sadeSati = {
      ...d.sadeSati,
      description: td.sadeSati.description || d.sadeSati.description,
    };
  }
  if (td.pitra && d.pitra) {
    doshas.pitra = {
      ...d.pitra,
      description: td.pitra.description || d.pitra.description,
      ...(td.pitra.indicators ? { indicators: td.pitra.indicators } : {}),
    };
  }
  if (td.kemDruma && d.kemDruma) {
    doshas.kemDruma = {
      ...d.kemDruma,
      description: td.kemDruma.description || d.kemDruma.description,
      ...(td.kemDruma.cancellations ? { cancellations: td.kemDruma.cancellations } : {}),
    };
  }
  if (td.grahan && d.grahan) {
    doshas.grahan = { ...d.grahan, description: td.grahan.description || d.grahan.description };
  }
  if (td.guruChandal && d.guruChandal) {
    doshas.guruChandal = {
      ...d.guruChandal,
      description: td.guruChandal.description || d.guruChandal.description,
    };
  }

  return { yogas, doshas };
}

function buildTranslationPrompt(payload: TranslatablePayload, targetLanguage: string): string {
  return `Translate the following Vedic astrology yoga/dosha names and descriptions into the language "${targetLanguage}".
Keep the exact same JSON structure and keys. ONLY translate the string values (name/description/cancellations/indicators entries), never the "index" numbers or the dosha keys (mangal/kaalSarp/sadeSati/pitra/kemDruma/grahan/guruChandal).

Original Content:
${JSON.stringify(payload, null, 2)}`;
}

function parseTranslation(raw: string): TranslatablePayload | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as {
      yogas?: unknown;
      doshas?: unknown;
    };
    const yogas: TranslatableYogaEntry[] = Array.isArray(data.yogas)
      ? (data.yogas as Array<Record<string, unknown>>)
          .filter(
            (y) =>
              typeof y.index === 'number' &&
              typeof y.name === 'string' &&
              typeof y.description === 'string',
          )
          .map((y) => ({
            index: y.index as number,
            name: y.name as string,
            description: y.description as string,
          }))
      : [];
    const doshas = (
      data.doshas && typeof data.doshas === 'object' ? data.doshas : {}
    ) as TranslatableDoshas;
    return { yogas, doshas };
  } catch {
    return null;
  }
}

/**
 * Translates a kundli's yoga/dosha `name`/`description` (+ a few dosha-specific
 * prose arrays) into another language. No fallback on parse failure — throws,
 * same discipline as `generateHouseInsight` — callers must catch and fall back
 * to the untranslated English content rather than saving a corrupted cache entry.
 */
export async function translateYogaDoshaContent(
  content: KundliContent,
  targetLanguage: string,
): Promise<KundliContent> {
  const payload = extractTranslatable(content);
  if (payload.yogas.length === 0 && Object.keys(payload.doshas).length === 0) {
    return content; // nothing translatable present — skip the LLM call entirely
  }

  const raw = await generate({
    profile: KUNDLI_CONTENT_TRANSLATION_PROFILE,
    responseSchema: {
      type: 'object',
      properties: {
        yogas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: { type: 'number' },
              name: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        doshas: {
          type: 'object',
          properties: {
            mangal: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                cancellations: { type: 'array', items: { type: 'string' } },
              },
            },
            kaalSarp: {
              type: 'object',
              properties: { name: { type: 'string' }, description: { type: 'string' } },
            },
            sadeSati: { type: 'object', properties: { description: { type: 'string' } } },
            pitra: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                indicators: { type: 'array', items: { type: 'string' } },
              },
            },
            kemDruma: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                cancellations: { type: 'array', items: { type: 'string' } },
              },
            },
            grahan: { type: 'object', properties: { description: { type: 'string' } } },
            guruChandal: { type: 'object', properties: { description: { type: 'string' } } },
          },
        },
      },
    },
    messages: [{ role: 'user', content: buildTranslationPrompt(payload, targetLanguage) }],
  });

  const translated = parseTranslation(raw);
  if (!translated) {
    throw new Error(
      `kundli yoga/dosha translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }

  return spliceTranslated(content, translated);
}
