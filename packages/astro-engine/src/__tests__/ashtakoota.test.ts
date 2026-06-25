import { describe, it, expect } from 'vitest';
import { calculateAshtakoota } from '../matching/ashtakoota';

describe('Ashtakoota Matching', () => {
  it('should return total max score of 36', () => {
    const result = calculateAshtakoota(0, 0, 'Aries', 'Aries');
    const maxTotal = result.scores.reduce((sum, s) => sum + s.maxScore, 0);
    expect(maxTotal).toBe(36);
  });

  it('should give 0 Nadi score for same nakshatra (same nadi)', () => {
    // Same nakshatra index = same nadi
    const result = calculateAshtakoota(0, 0, 'Aries', 'Aries');
    const nadiScore = result.scores.find((s) => s.koota === 'Nadi');
    expect(nadiScore).toBeDefined();
    expect(nadiScore!.score).toBe(0);
  });

  it('should give 8 Nadi score for different nadi nakshatras', () => {
    // Ashwini (index 0, Aadi) vs Bharani (index 1, Madhya)
    const result = calculateAshtakoota(0, 1, 'Aries', 'Aries');
    const nadiScore = result.scores.find((s) => s.koota === 'Nadi');
    expect(nadiScore).toBeDefined();
    expect(nadiScore!.score).toBe(8);
  });

  it('should give 6 Gana score for Deva-Deva', () => {
    // Ashwini (index 0) = Deva, Mrigashira (index 4) = Deva
    const result = calculateAshtakoota(0, 4, 'Aries', 'Gemini');
    const ganaScore = result.scores.find((s) => s.koota === 'Gana');
    expect(ganaScore).toBeDefined();
    expect(ganaScore!.score).toBe(6);
  });

  it('should give 0 Gana score for Deva-Rakshasa', () => {
    // Ashwini (index 0) = Deva, Ashlesha (index 8) = Rakshasa
    const result = calculateAshtakoota(0, 8, 'Aries', 'Cancer');
    const ganaScore = result.scores.find((s) => s.koota === 'Gana');
    expect(ganaScore).toBeDefined();
    expect(ganaScore!.score).toBe(0);
  });

  it('should return overall compatibility category', () => {
    const result = calculateAshtakoota(0, 4, 'Aries', 'Gemini');
    expect(['excellent', 'good', 'average', 'below_average', 'poor']).toContain(
      result.overallCompatibility,
    );
  });

  it('should return 8 individual scores', () => {
    const result = calculateAshtakoota(0, 4, 'Aries', 'Gemini');
    expect(result.scores.length).toBe(8);
  });

  it('should return valid total score between 0 and 36', () => {
    const result = calculateAshtakoota(5, 15, 'Gemini', 'Scorpio');
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(36);
  });

  it('should include mangal match info', () => {
    const result = calculateAshtakoota(0, 4, 'Aries', 'Gemini');
    expect(result.mangalMatch).toBeDefined();
    expect(typeof result.mangalMatch.compatible).toBe('boolean');
  });
});
