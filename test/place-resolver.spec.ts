import { describe, expect, it } from 'vitest';
import {
  normalizePlaceText,
  placeCount,
  resolvePlace,
} from '../src/modules/mcp/place-resolver.js';

function resolved(input: string) {
  const result = resolvePlace(input);
  if (result.status !== 'resolved') throw new Error(`${input} -> ${result.status}`);
  return result.place;
}

describe('place resolver (bundled GeoNames list)', () => {
  it('loads the list', () => {
    expect(placeCount()).toBeGreaterThan(60_000);
  });

  it('normalises accents, case and punctuation', () => {
    expect(normalizePlaceText('  São Paulo,  BRAZIL ')).toBe('sao paulo brazil');
  });

  it('resolves a plain Indian city with coordinates and timezone', () => {
    const pune = resolved('Pune');
    expect(pune).toMatchObject({ name: 'Pune', region: 'Maharashtra', country: 'India' });
    expect(pune.timezone).toBe('Asia/Kolkata');
    expect(pune.lat).toBeCloseTo(18.52, 1);
    expect(pune.lon).toBeCloseTo(73.86, 1);
  });

  it('understands old names', () => {
    expect(resolved('Bombay').name).toBe('Mumbai');
    expect(resolved('Benares, India').name).toBe('Varanasi');
    expect(resolved('Trivandrum').name).toBe('Thiruvananthapuram');
  });

  it('uses the words after the name to choose between namesakes', () => {
    expect(resolved('Hyderabad, Pakistan').country).toBe('Pakistan');
    expect(resolved('Hyderabad Telangana India').country).toBe('India');
    expect(resolved('Springfield, IL').region).toBe('Illinois');
    expect(resolved('Springfield, Illinois, USA').region).toBe('Illinois');
    expect(resolved('London, UK').country).toBe('United Kingdom');
  });

  it('takes a far larger namesake as the one meant', () => {
    expect(resolved('Delhi').country).toBe('India');
    expect(resolved('New York').timezone).toBe('America/New_York');
  });

  it('asks instead of guessing when namesakes are of similar size', () => {
    const result = resolvePlace('Springfield, USA');
    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.candidates.length).toBeGreaterThan(1);
      expect(result.candidates.every((c) => c.country === 'United States')).toBe(true);
    }
  });

  it('offers near spellings as choices, never as the answer', () => {
    const result = resolvePlace('Banglore');
    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.candidates.map((c) => c.name)).toContain('Bengaluru');
    }
  });

  it('reports an unknown place', () => {
    expect(resolvePlace('Qqqqzzzz').status).toBe('not_found');
    expect(resolvePlace('   ').status).toBe('not_found');
  });
});
