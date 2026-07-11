import { describe, it, expect } from 'vitest';
import { buildPurchasePlanPrompt, parsePurchasePlanResponse } from '../src/lib/llm/purchase-plan';
import type { PanchangData } from '@aroha-astrology/shared';

const SAMPLE_PANCHANG: PanchangData = {
  tithi: { number: 5, name: 'Panchami', paksha: 'Shukla', deity: 'Naga', isAuspicious: true },
  nakshatra: { index: 3, name: 'Rohini', lord: 'Moon', pada: 1, deity: 'Brahma' },
  yoga: { index: 1, name: 'Priti', isAuspicious: true },
  karana: { index: 1, name: 'Bava', isFixed: false },
  vara: 'Shanivaar',
  rahuKaal: { start: '09:00', end: '10:30' },
  gulikaKaal: { start: '06:00', end: '07:30' },
  yamagandaKaal: { start: '13:30', end: '15:00' },
  abhijitMuhurta: { start: '11:50', end: '12:38' },
  sunriseTime: '06:00',
  sunsetTime: '18:30',
};

describe('buildPurchasePlanPrompt', () => {
  it('includes both dates, the category, and the JSON schema instruction', () => {
    const prompt = buildPurchasePlanPrompt({
      category: 'vehicle',
      metadata: { vehicleType: 'Car' },
      resolvedBookingDate: '2026-08-01',
      resolvedDeliveryDate: '2026-08-06',
      bookingDateProvided: true,
      deliveryDateProvided: false,
      bookingPanchang: SAMPLE_PANCHANG,
      deliveryPanchang: SAMPLE_PANCHANG,
      chartContext: 'Ascendant: Leo',
      language: 'en',
    });
    expect(prompt).toContain('2026-08-01');
    expect(prompt).toContain('2026-08-06');
    expect(prompt).toContain('Vehicle');
    expect(prompt).toContain('vehicleType: Car');
    expect(prompt).toContain('Ascendant: Leo');
    expect(prompt).toContain('"overallScore"');
    expect(prompt).toContain('Output ONLY a single JSON object');
  });
});

describe('parsePurchasePlanResponse', () => {
  it('parses clean JSON', () => {
    const result = parsePurchasePlanResponse('{"overallScore": 80}');
    expect(result.parseError).toBe(false);
    expect(result.analysis.overallScore).toBe(80);
  });

  it('strips markdown code fences before parsing', () => {
    const result = parsePurchasePlanResponse('```json\n{"overallScore": 80}\n```');
    expect(result.parseError).toBe(false);
    expect(result.analysis.overallScore).toBe(80);
  });

  it('falls back to a raw/parseError shape on malformed JSON', () => {
    const result = parsePurchasePlanResponse('not json at all');
    expect(result.parseError).toBe(true);
    expect(result.analysis).toHaveProperty('raw', 'not json at all');
  });

  it('recovers from stray closing braces the model appends after a complete object', () => {
    // Observed in production (plan c6c7f8b1-911f-44a3-a508-d3094d541fcb): Gemini
    // emitted a fully-formed, schema-correct object followed by two extra "}".
    const result = parsePurchasePlanResponse('{"overallScore": 80}\n}\n}');
    expect(result.parseError).toBe(false);
    expect(result.analysis.overallScore).toBe(80);
  });

  it('does not let braces inside string values confuse the recovery scan', () => {
    const result = parsePurchasePlanResponse('{"overallVerdict": "use the {abhijit} window"}\n}');
    expect(result.parseError).toBe(false);
    expect(result.analysis.overallVerdict).toBe('use the {abhijit} window');
  });
});
