import { describe, expect, it } from 'vitest';
import { generateCampaignKey } from '../src/modules/gift-campaigns/gift-campaigns.repo.js';

describe('generateCampaignKey', () => {
  it('slugifies the title and appends a random suffix', () => {
    const key = generateCampaignKey('Diwali 2026!');
    expect(key).toMatch(/^diwali_2026_[a-f0-9]{8}$/);
  });

  it('never contains a colon (wallet_transactions.reason constraint)', () => {
    expect(generateCampaignKey('A: Weird Title')).not.toContain(':');
  });

  it('produces different keys for the same title', () => {
    const a = generateCampaignKey('Lohri');
    const b = generateCampaignKey('Lohri');
    expect(a).not.toBe(b);
  });
});
