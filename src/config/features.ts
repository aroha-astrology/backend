/**
 * The canonical server-driven feature registry. This is the single source of
 * truth for every togglable feature/price in the system: the admin dashboard
 * (built on top of this, not here) edits `feature_flags` DB rows keyed by
 * `FeatureDef.key`; the resolver service (`features.service.ts`) merges those
 * overrides on top of the defaults declared below; the enforcement middleware
 * (`middleware/feature.ts`) and the `/v1/me` payload both read the resolved
 * result. Adding a new togglable feature means adding an entry here — nothing
 * else needs to know about it until it's actually wired to a toggle point.
 */

export interface FeatureDef {
  key: string;
  label: string;
  group: 'nav' | 'home' | 'paid' | 'reports';
  defaultEnabled: boolean;
  defaultPricePaise?: number;
}

export const FEATURE_REGISTRY: readonly FeatureDef[] = [
  // nav
  { key: 'nav.home', label: 'Home tab', group: 'nav', defaultEnabled: true },
  { key: 'nav.vastu', label: 'Vastu tab', group: 'nav', defaultEnabled: true },
  { key: 'nav.askAI', label: 'Ask AI tab', group: 'nav', defaultEnabled: true },
  { key: 'nav.horoscope', label: 'Horoscope tab', group: 'nav', defaultEnabled: true },
  { key: 'nav.panchang', label: 'Panchang tab', group: 'nav', defaultEnabled: true },
  // home
  { key: 'home.todayReading', label: 'Today Reading card', group: 'home', defaultEnabled: true },
  { key: 'home.kundliCard', label: 'Kundli card', group: 'home', defaultEnabled: true },
  { key: 'home.horoscopeSlider', label: 'Horoscope slider', group: 'home', defaultEnabled: true },
  { key: 'home.matchmaking', label: 'Matchmaking card', group: 'home', defaultEnabled: true },
  // New card: defaults OFF per standing rule — every new card ships dark and
  // is turned on deliberately from the admin panel once ready (see memory
  // feedback-new-cards-default-off-in-admin).
  {
    key: 'home.reportsSection',
    label: 'Reports section (home)',
    group: 'home',
    defaultEnabled: false,
  },
  // New feature, defaults OFF for the same standing reason as
  // home.reportsSection above, AND because this feature handles biometric
  // (palm photograph) data — must be verified end-to-end on the admin's own
  // account via Admin -> Features before being enabled for anyone else.
  {
    key: 'home.palmReading',
    label: 'Palm Reading card (home)',
    group: 'home',
    defaultEnabled: false,
  },
  // paid
  {
    key: 'paid.chat',
    label: 'AI Chat',
    group: 'paid',
    defaultEnabled: true,
    defaultPricePaise: 2000,
  },
  {
    key: 'paid.houseInsight',
    label: 'House Insight (per house)',
    group: 'paid',
    defaultEnabled: true,
    defaultPricePaise: 5000,
  },
  {
    key: 'paid.vastu',
    label: 'Vastu Report',
    group: 'paid',
    defaultEnabled: true,
    defaultPricePaise: 5000,
  },
  {
    key: 'paid.gemstone',
    label: 'Gemstone Report',
    group: 'paid',
    defaultEnabled: true,
    defaultPricePaise: 10000,
  },
  {
    key: 'paid.profileCreation',
    label: 'Extra Birth Profile',
    group: 'paid',
    defaultEnabled: true,
    defaultPricePaise: 20000,
  },
  // Defaults OFF — see home.palmReading above for why. Gate this one deliberately from
  // Admin -> Features once the live vision model and cost-per-reading have been validated.
  {
    key: 'paid.palmReading',
    label: 'Palm Reading',
    group: 'paid',
    defaultEnabled: false,
    defaultPricePaise: 9900,
  },
  // Realtime voice conversation (Gemini Live). Defaults OFF for the standing
  // "new features ship dark" reason, and for two more specific to this one:
  // it records the user's voice (see the separate voice-consent gate in
  // users.voice_consent_at — the flag alone is not enough to reach it), and it
  // runs on a preview model whose free-tier quota is shared with every text
  // feature in the app, so it must be watched against real traffic before it
  // is opened up.
  //
  // UNIQUE PRICING SHAPE: this price is PER MINUTE, not per use. Every other
  // paid.* key here is charged once per unlock/report. Voice is charged once
  // per minute of connected conversation, capped at VOICE_MAX_MINUTES (see
  // modules/voice/voice.service.ts) — so the most a single session can cost is
  // this price × that cap.
  {
    key: 'paid.voiceChat',
    label: 'Voice Chat (realtime, per minute)',
    group: 'paid',
    defaultEnabled: false,
    defaultPricePaise: 2000,
  },
  // reports (one-time)
  {
    key: 'reports.marriage',
    label: 'Marriage Report',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 9900,
  },
  {
    key: 'reports.past_life',
    label: 'Past Life Report',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 2500,
  },
  {
    key: 'reports.kundli_milan',
    label: 'Kundli Milan Report',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 9900,
  },
  {
    key: 'reports.true_love',
    label: 'True Love Report',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 9900,
  },
  {
    key: 'reports.wealth',
    label: 'Wealth Report',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 9900,
  },
  {
    key: 'reports.baby_name',
    label: 'Baby Name Report',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 9900,
  },
  // reports (monthly — price is per-month base; bundle math lives elsewhere)
  {
    key: 'reports.health_monthly',
    label: 'Health Report (Monthly)',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 2500,
  },
  {
    key: 'reports.career_monthly',
    label: 'Career Report (Monthly)',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 2500,
  },
  {
    key: 'reports.finance_monthly',
    label: 'Finance Report (Monthly)',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 2500,
  },
  {
    key: 'reports.relationship_monthly',
    label: 'Relationship Report (Monthly)',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 2500,
  },
  // Unlike every other reports.* key (all off by default, turned on deliberately from the
  // admin panel), this one defaults ON — it's the paid replacement for the compatibility
  // page's "Check Compatibility" button, an existing always-on nav feature, not a new
  // discretionary report a user opts into browsing.
  {
    key: 'reports.match_report',
    label: 'Compatibility Match Report',
    group: 'reports',
    defaultEnabled: true,
    defaultPricePaise: 5000,
  },
  {
    key: 'reports.numerology',
    label: 'Numerology Report',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 9900,
  },
  {
    key: 'reports.name_change',
    label: 'Name Change Report',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 4900,
  },
] as const;

const FEATURE_KEY_SET: ReadonlySet<string> = new Set(FEATURE_REGISTRY.map((f) => f.key));

export function isKnownFeatureKey(key: string): boolean {
  return FEATURE_KEY_SET.has(key);
}
