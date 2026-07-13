import { generate } from './gemini-client.js';
import { PURCHASE_PLAN_PROFILE } from '../../config/llm.js';
import type { PanchangData } from '@aroha-astrology/shared';

export interface PurchasePlanInput {
  category: 'vehicle' | 'home' | 'commercial' | 'other';
  metadata: Record<string, string>;
  costBracket?: string | undefined;
  resolvedBookingDate: string;
  resolvedDeliveryDate: string;
  bookingDateProvided: boolean;
  deliveryDateProvided: boolean;
  bookingPanchang: PanchangData;
  deliveryPanchang: PanchangData;
  chartContext: string;
  language: string;
}

const CATEGORY_LABELS: Record<PurchasePlanInput['category'], string> = {
  vehicle: 'Vehicle',
  home: 'Home',
  commercial: 'Commercial property',
  other: 'Purchase',
};

function formatPanchangBlock(label: string, date: string, p: PanchangData): string {
  return [
    `${label} (${date}):`,
    `- Tithi: ${p.tithi.name} (${p.tithi.paksha} Paksha)`,
    `- Nakshatra: ${p.nakshatra.name}`,
    `- Yoga: ${p.yoga.name}`,
    `- Karana: ${p.karana.name}`,
    `- Vara: ${p.vara}`,
    `- Rahu Kaal: ${p.rahuKaal.start}-${p.rahuKaal.end}`,
    `- Gulika Kaal: ${p.gulikaKaal.start}-${p.gulikaKaal.end}`,
    `- Yamaganda Kaal: ${p.yamagandaKaal.start}-${p.yamagandaKaal.end}`,
    `- Abhijit Muhurta: ${p.abhijitMuhurta.start}-${p.abhijitMuhurta.end}`,
    `- Sunrise/Sunset: ${p.sunriseTime} / ${p.sunsetTime}`,
  ].join('\n');
}

export function buildPurchasePlanPrompt(input: PurchasePlanInput): string {
  const categoryLabel = CATEGORY_LABELS[input.category];
  const metadataLines =
    Object.entries(input.metadata)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n') || '- (no additional details provided)';

  return `You are a Vedic astrology expert analyzing the timing of a major purchase.

PURCHASE DETAILS:
- Category: ${categoryLabel}
${metadataLines}
${input.costBracket ? `- Budget: ${input.costBracket}` : ''}

DATES TO ANALYZE:
- Booking date: ${input.resolvedBookingDate} (${input.bookingDateProvided ? 'provided by user' : 'auto-calculated'})
- Delivery/possession date: ${input.resolvedDeliveryDate} (${input.deliveryDateProvided ? 'provided by user' : 'auto-calculated'})

${formatPanchangBlock('BOOKING DATE PANCHANG', input.resolvedBookingDate, input.bookingPanchang)}

${formatPanchangBlock('DELIVERY DATE PANCHANG', input.resolvedDeliveryDate, input.deliveryPanchang)}

BIRTH CHART CONTEXT:
${input.chartContext}

ANALYSIS INSTRUCTIONS:
Evaluate both dates for auspiciousness considering: tithi suitability for new acquisitions, nakshatra quality, yoga/karana favorability, whether the date falls in Rahu Kaal/Yamaganda/an inauspicious window, and how the person's current dasha and chart placements (2nd house = wealth, 4th house = property/vehicles, 11th house = gains) interact with the timing. Recommend specific auspicious time windows within each day where possible (e.g. Abhijit Muhurta).

Respond in language: ${input.language}.

Output ONLY a single JSON object (no markdown fences, no commentary) matching exactly this shape:
{
  "summary": ["<hook line>", "<nuance line>", "<action line>"],
  "overallScore": <integer 1-100>,
  "overallVerdict": "<one sentence>",
  "tldr": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
  "bookingDate": {
    "date": "${input.resolvedBookingDate}",
    "provided": ${input.bookingDateProvided},
    "score": <integer 1-100>,
    "verdict": "<one sentence>",
    "highlights": ["<string>"],
    "warnings": ["<string>"],
    "bestTimeWindows": ["<string>"],
    "avoidTimes": ["<string>"]
  },
  "deliveryDate": {
    "date": "${input.resolvedDeliveryDate}",
    "provided": ${input.deliveryDateProvided},
    "score": <integer 1-100>,
    "verdict": "<one sentence>",
    "highlights": ["<string>"],
    "warnings": ["<string>"],
    "bestTimeWindows": ["<string>"],
    "avoidTimes": ["<string>"]
  },
  "birthChartInsights": {
    "currentDasha": "<string>",
    "dashaVerdict": "<one sentence>",
    "favorablePlanets": ["<string>"],
    "challengingFactors": ["<string>"],
    "keyHouses": "<one sentence about houses 2/4/11>"
  },
  "remedies": ["<string>"],
  "luckyColor": "<string>",
  "luckyDirection": "<string>",
  "finalAdvice": "<2-3 sentences>"
}`;
}

/**
 * Extracts the first balanced `{...}` object from `text`, respecting string
 * literals (so `{`/`}` inside a string value don't throw off the brace
 * count). Returns null if no balanced object is found.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Never throws on malformed LLM JSON — callers persist the fallback shape instead of failing the row. */
export function parsePurchasePlanResponse(raw: string): {
  analysis: Record<string, unknown>;
  parseError: boolean;
} {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '');
  try {
    return { analysis: JSON.parse(cleaned) as Record<string, unknown>, parseError: false };
  } catch {
    // Gemini occasionally appends stray closing braces after an otherwise
    // complete, valid object (seen in production) — recover by re-parsing
    // just the first balanced object instead of the whole trailing garbage.
    const extracted = extractFirstJsonObject(cleaned);
    if (extracted) {
      try {
        return { analysis: JSON.parse(extracted) as Record<string, unknown>, parseError: false };
      } catch {
        // fall through to the raw fallback below
      }
    }
    return { analysis: { raw: cleaned, parseError: true }, parseError: true };
  }
}

export async function generatePurchasePlanAnalysis(
  input: PurchasePlanInput,
): Promise<{ analysis: Record<string, unknown>; parseError: boolean }> {
  const prompt = buildPurchasePlanPrompt(input);
  const raw = await generate({
    profile: PURCHASE_PLAN_PROFILE,
    messages: [{ role: 'user', content: prompt }],
    timeoutMs: 180_000,
  });
  return parsePurchasePlanResponse(raw);
}

export function buildPurchasePlanTranslationPrompt(
  original: Record<string, unknown>,
  targetLanguage: string,
): string {
  return `Translate the following Vedic astrology purchase plan analysis into the language "${targetLanguage}".
Keep the exact same JSON structure and keys. ONLY translate the string values, not the keys. Preserve structure/keys.

Original Content:
${JSON.stringify(original, null, 2)}`;
}

export async function translatePurchasePlanContent(
  original: Record<string, unknown>,
  targetLanguage: string,
): Promise<Record<string, unknown>> {
  const raw = await generate({
    profile: PURCHASE_PLAN_PROFILE,
    messages: [
      { role: 'user', content: buildPurchasePlanTranslationPrompt(original, targetLanguage) },
    ],
  });

  const { analysis, parseError } = parsePurchasePlanResponse(raw);
  if (parseError) {
    throw new Error(
      `purchase plan translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
  return analysis;
}
