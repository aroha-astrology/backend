// =============================================================================
// Chat app guide
// =============================================================================
// Asked "find my birth time", the astrologer explained that rectification
// needs a history of life events it did not have, and told the user to check
// their records — while the app has a birth-time check built for exactly that
// (Account Settings → Birth Time Confidence, Aroha Pass Gold and above). It
// had never been told the app's features exist.
//
// These lines tell it, for THIS user: which screens are switched on for them,
// how to get there, and whether their Pass covers it. A screen whose switch is
// off is left out, so the astrologer never sends anyone to a screen they
// cannot see. The prompt (scholar.ts, "Using the app") answers from these
// lines only.
// =============================================================================

import type { ResolvedFeature } from '../modules/features/features.service.js';
import { PASS_TIERS, type PassEntitlement, type PassFeature } from '../modules/pass/pass.config.js';

interface GuideEntry {
  /** What the user is trying to do, in the words they might use. */
  ask: string;
  /** The screen, by the name the app shows. */
  screen: string;
  /** Every one of these switches must be on. */
  keys: readonly string[];
  /** Left out when any of these is on (a newer screen that replaces this one). */
  unlessKeys?: readonly string[];
  /** How to get there and what to do on it, in the app's English labels. */
  steps: string;
  /** Pass-only: the feature name requirePass() checks. */
  pass?: PassFeature;
}

const MENU = 'the ☰ menu (top left)';

const GUIDE: readonly GuideEntry[] = [
  {
    ask: 'find, check or correct their birth time (birth time rectification)',
    screen: 'Birth Time Confidence',
    keys: ['home.birthTimeConfidence'],
    steps:
      `${MENU} → Account Settings → the Birth Time Confidence card (it is also at the bottom of Home → Your Kundli → View full kundli). ` +
      'They add 3 or more major life events with their dates (a new job, marriage, a child, moving abroad…); the app suggests a corrected time within an hour either side, with a confidence level, ' +
      'and nothing changes unless they tap "Use {time} as my birth time".',
    pass: 'birthTime',
  },
  {
    ask: 'find, check or correct their birth time (birth time rectification)',
    screen: 'Check your birth time',
    keys: ['home.birthTimeRectify'],
    unlessKeys: ['home.birthTimeConfidence'],
    steps:
      `${MENU} → Account Settings → the "Check your birth time" card. ` +
      'They add 3 or more major life events with their dates; the app suggests a time within an hour either side, and changes nothing itself.',
  },
  {
    ask: 'see which years or periods of life are strong for career, love, money and so on',
    screen: 'Life Timeline',
    keys: ['nav.lifeTimeline'],
    steps: `${MENU} → Life Timeline. Tap any bar for its years, ages and why.`,
    pass: 'timeline',
  },
  {
    ask: 'know whether, or when, to make a decision (change job, buy property, marry, start a business, move)',
    screen: 'Decisions',
    keys: ['nav.decisions'],
    steps: `${MENU} → Decisions. Pick the decision and how far ahead to look; it shows favourable and careful windows and the strongest dates.`,
    pass: 'decisions',
  },
  {
    ask: 'pick a good date and time (muhurat) for a wedding, housewarming, vehicle, business opening, journey, puja',
    screen: 'Find My Date',
    keys: ['panchang.findMyDate'],
    steps: `${MENU} → Find My Date (also a card on the Panchang tab). Pick the occasion and the place.`,
    pass: 'findMyDate',
  },
  {
    ask: 'see how their chart meets a partner, parent, child, friend or business partner over time',
    screen: 'Bonds',
    keys: ['nav.bonds'],
    steps: `${MENU} → Bonds (also the Your Bonds card on Home). Add the person, then tap them.`,
    pass: 'bonds',
  },
  {
    ask: 'know which city or country suits them (relocation, moving abroad)',
    screen: 'Relocation',
    keys: ['nav.relocation'],
    steps: `${MENU} → Relocation. Add the cities; each gets scores for career, relationships, finance and more.`,
    pass: 'relocation',
  },
  {
    ask: 'match two kundlis (guna milan) for marriage',
    screen: 'Match Making',
    keys: ['home.matchmaking'],
    steps: 'Home → the Match Making card. Fill in both people, then Check Compatibility.',
  },
  {
    ask: 'get a full written report (marriage, wealth, career, children, numerology, name change…)',
    screen: 'Reports',
    keys: ['nav.reports'],
    steps:
      'the Reports tab at the bottom. Tap a report to see what it covers and its price; bought reports are under ☰ menu → My Reports.',
  },
  {
    ask: "see today's tithi, nakshatra, Rahu Kaal, choghadiya or festival dates",
    screen: 'Panchang',
    keys: ['nav.panchang'],
    steps: 'the Panchang tab at the bottom.',
  },
  {
    ask: 'see the planet changes, dasha changes and eclipses coming up in their chart',
    screen: 'Calendar',
    keys: ['nav.calendar'],
    steps: `${MENU} → Calendar.`,
  },
  {
    ask: 'check the Vastu of their home',
    screen: 'Vastu',
    keys: ['home.vastuCard'],
    steps:
      'Home → the Vastu card. Draw the house and rooms, align to North, and the analysis updates live.',
  },
  {
    ask: 'get a palm reading',
    screen: 'Palm Reading',
    keys: ['home.palmReading'],
    steps: 'Home → the Palm Reading card. It guides 6 photos of the hands.',
  },
];

const TIER_NAME = { silver: 'Silver', gold: 'Gold', platinum: 'Platinum' } as const;

const on = (features: Record<string, ResolvedFeature>, key: string) =>
  features[key]?.enabled ?? false;

/** The cheapest tier on sale that includes `feature`, or null when none is. */
function cheapestTier(
  features: Record<string, ResolvedFeature>,
  feature: PassFeature,
): (typeof PASS_TIERS)[number] | null {
  return (
    PASS_TIERS.find(
      (t) => on(features, t.key) && (t.features as readonly PassFeature[]).includes(feature),
    ) ?? null
  );
}

function rupees(paise: number): string {
  const amount = paise / 100;
  return `₹${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

/**
 * The APP FEATURES lines for this user, or [] when no listed screen is on.
 * `pass` is the user's live Pass (passEntitlement()), null without one.
 */
export function chatAppGuideFacts(
  features: Record<string, ResolvedFeature>,
  pass: PassEntitlement | null,
): string[] {
  const lines: string[] = [];
  for (const entry of GUIDE) {
    if (!entry.keys.every((k) => on(features, k))) continue;
    if (entry.unlessKeys?.some((k) => on(features, k))) continue;

    let access = 'Open to every user.';
    if (entry.pass) {
      if (pass?.features.includes(entry.pass)) {
        access = "Included in this user's Aroha Pass.";
      } else {
        const tier = cheapestTier(features, entry.pass);
        // A Pass-only screen nobody can buy is a dead end: leave it out.
        if (!tier) continue;
        const price = rupees(features[tier.key]?.pricePaise ?? tier.fallbackPaise);
        const name = TIER_NAME[tier.tier];
        access =
          `Aroha Pass only: needs the ${name} Pass (${price} a month) or higher` +
          (pass
            ? ', and this user\'s Pass does not include it. Opening the screen shows a lock card with an "Upgrade to unlock" button'
            : ', and this user has no Pass. Opening the screen shows a lock card with a "Subscribe to unlock" button') +
          '; the Pass is bought through Google Play in the Android app.';
      }
    }
    lines.push(
      `APP FEATURE — when the user wants to ${entry.ask}: the "${entry.screen}" screen. How to get there: ${entry.steps} ${access}`,
    );
  }
  return lines;
}
