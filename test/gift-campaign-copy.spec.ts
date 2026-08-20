import { describe, expect, it } from 'vitest';
import { getGiftCampaignPushCopy } from '../src/modules/gift-campaigns/gift-campaign-copy.js';

describe('getGiftCampaignPushCopy', () => {
  it('interpolates title and amount for self_claim in English', () => {
    const copy = getGiftCampaignPushCopy('en', 'self_claim', 'Diwali', '₹50');
    expect(copy.title).toContain('₹50');
    expect(copy.body).toContain('Diwali');
    expect(copy.body).toContain('₹50');
  });

  it('interpolates title and amount for auto_credit in Hindi', () => {
    const copy = getGiftCampaignPushCopy('hi', 'auto_credit', 'दिवाली', '₹50');
    expect(copy.title).toContain('₹50');
    expect(copy.body).toContain('दिवाली');
  });

  it('falls back to English for an unrecognized language code', () => {
    // @ts-expect-error deliberately invalid at the type level, valid at runtime for the fallback check
    const copy = getGiftCampaignPushCopy('fr', 'self_claim', 'Diwali', '₹50');
    expect(copy.title).toContain('₹50');
  });

  it('every supported language has both delivery-mode templates', () => {
    for (const lang of ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu'] as const) {
      expect(getGiftCampaignPushCopy(lang, 'self_claim', 'X', '₹1').title.length).toBeGreaterThan(
        0,
      );
      expect(getGiftCampaignPushCopy(lang, 'auto_credit', 'X', '₹1').title.length).toBeGreaterThan(
        0,
      );
    }
  });
});
