import { describe, expect, it } from 'vitest';
import { chatAppGuideFacts } from '../src/lib/chat-app-guide.js';
import type { ResolvedFeature } from '../src/modules/features/features.service.js';
import { entitlementForRow, GROUP_ENTITLEMENT } from '../src/modules/pass/pass.config.js';

function features(on: Record<string, number | null>): Record<string, ResolvedFeature> {
  return Object.fromEntries(
    Object.entries(on).map(([key, pricePaise]) => [
      key,
      { enabled: true, pricePaise, originalPricePaise: null, model: null } as ResolvedFeature,
    ]),
  );
}

const PASS_ON = { 'paid.arohaPassA': 19900, 'paid.arohaPassB': 29900, 'paid.arohaPassC': 39900 };
const SILVER = entitlementForRow({ source: 'play', priceVariant: 'A' });
const GOLD = entitlementForRow({ source: 'play', priceVariant: 'B' });

const birthTimeLine = (lines: string[]) => lines.find((l) => l.includes('birth time'));

describe('chatAppGuideFacts', () => {
  it('points a user without a Pass to the birth-time check, with its path and the Gold Pass', () => {
    const line = birthTimeLine(
      chatAppGuideFacts(features({ 'home.birthTimeConfidence': null, ...PASS_ON }), null),
    );
    expect(line).toContain('"Birth Time Confidence"');
    expect(line).toContain('☰ menu (top left) → Account Settings');
    expect(line).toContain('needs the Gold Pass (₹299 a month) or higher');
    expect(line).toContain('this user has no Pass');
    expect(line).toContain('"Subscribe to unlock"');
    expect(line).toContain('Google Play');
  });

  it('says upgrade to a Silver member, and included to a Gold one', () => {
    const on = features({ 'home.birthTimeConfidence': null, ...PASS_ON });
    expect(birthTimeLine(chatAppGuideFacts(on, SILVER))).toContain('"Upgrade to unlock"');
    expect(birthTimeLine(chatAppGuideFacts(on, GOLD))).toContain(
      "Included in this user's Aroha Pass.",
    );
    expect(birthTimeLine(chatAppGuideFacts(on, GROUP_ENTITLEMENT))).toContain('Included');
  });

  it('follows the admin price and skips a tier that is switched off', () => {
    const line = birthTimeLine(
      chatAppGuideFacts(
        features({ 'home.birthTimeConfidence': null, 'paid.arohaPassC': 44900 }),
        null,
      ),
    );
    expect(line).toContain('needs the Platinum Pass (₹449 a month)');
  });

  it('leaves out a screen whose switch is off', () => {
    expect(chatAppGuideFacts(features(PASS_ON), null)).toEqual([]);
  });

  it('leaves out a Pass-only screen when no Pass that includes it is on sale', () => {
    expect(chatAppGuideFacts(features({ 'home.birthTimeConfidence': null }), null)).toEqual([]);
    // Silver is on sale but does not include the birth-time check.
    expect(
      chatAppGuideFacts(
        features({ 'home.birthTimeConfidence': null, 'paid.arohaPassA': 19900 }),
        null,
      ),
    ).toEqual([]);
  });

  it('shows the older free birth-time card only when the Pass card is off', () => {
    const free = birthTimeLine(
      chatAppGuideFacts(features({ 'home.birthTimeRectify': null }), null),
    );
    expect(free).toContain('"Check your birth time"');
    expect(free).toContain('Open to every user.');

    const both = chatAppGuideFacts(
      features({ 'home.birthTimeRectify': null, 'home.birthTimeConfidence': null, ...PASS_ON }),
      null,
    );
    expect(both.filter((l) => l.includes('birth time'))).toHaveLength(1);
    expect(birthTimeLine(both)).toContain('"Birth Time Confidence"');
  });

  it('lists free screens as open to everyone', () => {
    const lines = chatAppGuideFacts(
      features({ 'home.matchmaking': null, 'nav.panchang': null }),
      null,
    );
    expect(lines).toHaveLength(2);
    expect(
      lines.every((l) => l.startsWith('APP FEATURE — ') && l.endsWith('Open to every user.')),
    ).toBe(true);
  });
});
