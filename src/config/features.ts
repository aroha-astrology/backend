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

import { SELECTABLE_OXION_MODELS } from './oxion-models.js';

/**
 * Which section of the app a feature is for. 'classic' = users on the Indian look (Classic Vedic),
 * 'cosmic' = users on the international look (Modern Cosmic), 'all' = both. A user who has not
 * picked a look yet counts as classic. The owner changes it per feature in Admin -> Features.
 */
export type FeatureAudience = 'all' | 'classic' | 'cosmic';

export const FEATURE_AUDIENCES: readonly FeatureAudience[] = ['all', 'classic', 'cosmic'];

export interface FeatureDef {
  key: string;
  label: string;
  group:
    | 'nav'
    | 'home'
    | 'paid'
    | 'reports'
    | 'panchang'
    | 'referral'
    | 'ai'
    | 'rewards'
    | 'chat'
    | 'money'
    | 'experience'
    | 'live'
    | 'ritual'
    | 'circles'
    | 'memory'
    | 'community'
    | 'lang'
    | 'hooks'
    | 'palm';
  defaultEnabled: boolean;
  /** Starting audience; 'all' when absent. An admin override on the board wins. */
  defaultAudience?: FeatureAudience;
  /**
   * For `paid`/`reports` keys this is a PRICE the user is charged. For
   * `referral` keys it is a PAYOUT the user receives (or, for the cap, a
   * ceiling). Both are plain paise amounts resolved the same way — see
   * `priceOf()`/`payoutOf()` in features.service.ts. Any money amount in the
   * app belongs here rather than in a module-level constant: four features
   * previously kept their own and silently ignored the admin panel.
   */
  defaultPricePaise?: number;
  /**
   * The strike-through MRP shown next to `defaultPricePaise` until an admin override row
   * sets its own `originalPricePaise`. Only meaningful for `paid`/`reports` keys, and only
   * rendered when it is strictly greater than the price actually charged.
   */
  defaultOriginalPricePaise?: number;
  /**
   * Turns this entry into a MODEL PICKER in Admin -> Features: the dashboard renders a dropdown
   * of these options instead of a price box. Only the `ai` group uses it.
   *
   * Semantics of the row's toggle for a model key: `enabled: false` means "ignore the selection,
   * use the global `GEMINI_MODEL`" — i.e. the toggle is the kill switch that puts the feature
   * back on the default model without anyone having to remember which option that was.
   * `enabled: true` means "use the selected model". Resolution lives in `modelOf()`
   * (features.service.ts), which every call site must go through rather than reading a constant
   * — the same discipline `priceOf()` exists to enforce for money.
   */
  modelOptions?: readonly string[];
  /** The option pre-selected when no admin override row exists yet. */
  defaultModel?: string;
  /**
   * `'new'` marks a feature from the current roadmap build: Admin -> Features
   * shows a NEW badge and a "New only" filter for it. An admin-board hint only;
   * it changes nothing about how the feature resolves.
   */
  tag?: 'new';
}

/**
 * The Gemini models an admin may pick from. Deliberately a short curated list rather than a
 * free-text box: a typo'd model id fails every request for that feature until someone notices,
 * and per-model free-tier quotas differ (see gemini-key-pool.ts) so the set of models that are
 * actually affordable is a decision, not a text field.
 *
 * 2026-09-25: every text model the live key's `GET /v1beta/models` lists, newest first. The old
 * 'gemini-3.1-flash' and 'gemini-3.1-pro' ids were never real models (both 404), so they're gone;
 * a saved override still naming one falls back to the global model (see features.service.ts).
 * Keep frontend lib/admin-format.ts MODEL_PRICING in step with this list.
 */
export const SELECTABLE_GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

/**
 * Palm reading's model pickers: Gemini (Google keys) and Oxion ("oxion:<model>", on the Oxion key,
 * see lib/llm/oxion-client.ts). Owner, 2026-10-23: Omnirush is not used for palm; 2026-10-24: Oxion added.
 */
export const SELECTABLE_PALM_MODELS: readonly string[] = [
  ...SELECTABLE_GEMINI_MODELS,
  ...SELECTABLE_OXION_MODELS,
];

export const FEATURE_REGISTRY: readonly FeatureDef[] = [
  // nav
  { key: 'nav.home', label: 'Home tab', group: 'nav', defaultEnabled: true },
  // No longer a bottom-tab slot (moved to a Home card, see home.vastuCard
  // below) — still gates the /vastu page itself directly (FeatureGuard).
  { key: 'nav.vastu', label: 'Vastu page', group: 'nav', defaultEnabled: true },
  // The 3D view inside Vastu Studio (the 2D editor and Vastu Lens don't depend
  // on it). Client-only — there is no 3D API to gate — so this hides the 3D tab.
  // Ships dark per the standing rule; turn on from Admin -> Features.
  { key: 'nav.vastuThreeD', label: 'Vastu Studio 3D view', group: 'nav', defaultEnabled: false },
  { key: 'nav.askAI', label: 'Ask AI tab', group: 'nav', defaultEnabled: true },
  { key: 'nav.horoscope', label: 'Horoscope tab', group: 'nav', defaultEnabled: true },
  // Re-added as a bottom-tab slot (previously reachable only via Home's "See
  // All"/home.reportsSection) — takes the tab-bar position Vastu vacated.
  { key: 'nav.reports', label: 'Reports tab', group: 'nav', defaultEnabled: true },
  { key: 'nav.panchang', label: 'Panchang tab', group: 'nav', defaultEnabled: true },
  // New nav entry ships dark per the standing "new features ship dark" rule
  // (see home.reportsSection/home.palmReading above) — turned on deliberately
  // from Admin -> Features once the /remedies page (karmic profile + Lal
  // Kitab remedy list) has been checked end-to-end. Not a bottom-tab slot
  // (those five are fixed); this gates a ListRow in the profile drawer menu.
  { key: 'nav.remedies', label: 'Remedies menu entry', group: 'nav', defaultEnabled: false },
  // Gates the /shlokas library page (list + per-shloka detail). Split from
  // home.shlokas below the same way nav.vastu is split from home.vastuCard:
  // one key hides the entry point, the other closes the page itself. Ships
  // dark per the standing rule.
  { key: 'nav.shlokas', label: 'Shlokas & Japs page', group: 'nav', defaultEnabled: false },
  // Lets the astrologer ask, once, for the user's income range as a set of
  // tappable options when a money question needs a scale to read against (see
  // lib/chat-income.ts). Off means the prompt never raises income at all —
  // the gate is a single fact line, so flipping this needs no deploy. Ships
  // dark per the standing rule; the answers feed Admin -> User Demographics.
  {
    key: 'chat.incomeAsk',
    label: 'Ask income range in chat',
    group: 'chat',
    defaultEnabled: false,
  },
  // Gates the /gita library page (701 verses, category+need-tag browse, per-
  // verse detail + chant audio). Deliberately a SEPARATE feature from
  // nav.shlokas/home.shlokas above, not folded into that grid — different
  // scale (701 vs 50 verses), Sanskrit-only content shape (no 7-language
  // fields), and its audio streams from gita.routes.ts's own static mount
  // rather than the frontend's public/ bundle. Ships dark per the standing
  // rule.
  { key: 'nav.gita', label: 'Bhagavad Gita page', group: 'nav', defaultEnabled: false },
  // Gates the /rewards page (daily login streak) and its drawer entry.
  // The popup on app-open is gated by the same key on the frontend. Ships
  // dark per the standing rule — the payout amounts below stay enabled
  // (see rewards.dailyBase/rewards.streakBonus) so turning this on doesn't
  // also require re-enabling the two payout keys.
  { key: 'nav.rewards', label: 'Daily reward page', group: 'nav', defaultEnabled: false },
  // home
  { key: 'home.todayReading', label: 'Today Reading card', group: 'home', defaultEnabled: true },
  { key: 'home.kundliCard', label: 'Kundli card', group: 'home', defaultEnabled: true },
  { key: 'home.horoscopeSlider', label: 'Horoscope slider', group: 'home', defaultEnabled: true },
  { key: 'home.matchmaking', label: 'Matchmaking card', group: 'home', defaultEnabled: true },
  // Vastu's new Home entry point now that it's off the bottom tab bar — an
  // existing, already-shipped feature being relocated, not a new one under
  // review, so this defaults ON like matchmaking/kundliCard above.
  { key: 'home.vastuCard', label: 'Vastu card (home)', group: 'home', defaultEnabled: true },
  // New card: defaults OFF per standing rule — turned on deliberately from
  // Admin -> Features once checked end-to-end. Suggests a corrected birth
  // time from dated life events; never applies anything itself.
  {
    key: 'home.birthTimeRectify',
    label: 'Birth-time rectification card (settings)',
    group: 'home',
    defaultEnabled: false,
  },
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
  // Home entry point for the Shlokas & Japs library. Free — deliberately has
  // no `paid.*` counterpart, unlike every other content feature here. Ships
  // dark per the standing rule; turn on from Admin -> Features once the
  // artwork and chant audio have been checked on a real device.
  {
    key: 'home.shlokas',
    label: 'Shlokas & Japs card (home)',
    group: 'home',
    defaultEnabled: false,
  },
  // Gates the AI-picked remedy mantra card inside the daily/tomorrow
  // personalized horoscope detail sheet (see StructuredHoroscope.remedy in
  // db/schema.ts, REMEDY_RULE in lib/llm/horoscope.ts). Also requires
  // nav.shlokas on — the card's CTA links into the shloka library, which is
  // itself dark by default. Free, no paid.* key, same as the library it
  // links into. Ships dark per the standing rule.
  {
    key: 'home.horoscopeRemedy',
    label: 'Remedy mantra in horoscope',
    group: 'home',
    defaultEnabled: false,
  },
  // Home entry point for the Bhagavad Gita library. Free, no paid.* key.
  // Ships dark per the standing rule; turn on from Admin -> Features once the
  // 701-verse render has been spot-checked on a real device.
  {
    key: 'home.gita',
    label: 'Bhagavad Gita card (home)',
    group: 'home',
    defaultEnabled: false,
  },
  // Home entry point for Remedies, replacing its old spot as a ListRow in the
  // profile drawer. Split from nav.remedies the same way home.vastuCard is
  // split from nav.vastu: this key hides the card, nav.remedies still gates
  // the /remedies page itself. Ships dark per the standing rule — turn on
  // from Admin -> Features once the restyled page (image-per-remedy via the
  // shared asset library) has been checked end-to-end.
  {
    key: 'home.remedies',
    label: 'Remedies card (home)',
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
  // 2026-10-24 (owner): the full reading is open to everyone at the normal price (Rs 199, from the
  // wallet); an Aroha Pass member gets one free per Pass period and pays the normal price for any
  // more. Admin can hand a user's (or everyone's) free reading back from Admin -> Users.
  {
    key: 'paid.palmReading',
    label: 'Palm Reading (full reading: price for everyone; Aroha Pass gets one free per month)',
    group: 'paid',
    defaultEnabled: false,
    defaultPricePaise: 19900,
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
  // Retired (defaultEnabled flipped to false): kundli_milan's sections 6-7 ("Health, Wealth &
  // Career Compatibility" / "Children & Family Harmony Timing") already cover the same 8
  // life-area synastry read as this report — see kundli-milan.ts's own RISK_GROUNDING_RULE
  // doc comment, which says so explicitly ("the same synastry read the pricier Compatibility
  // Match Report uses"). Two ₹50-₹99 products doing the same job was confusing, not
  // complementary, so kundli_milan keeps the full read and this one goes dark. Existing
  // purchased match_report rows stay fully readable (the report detail route doesn't gate on
  // this flag) — this only turns off NEW purchases, both in the Reports catalogue (renders as
  // "Coming Soon" — see ReportCard.tsx's comingSoon prop) and on the dedicated /compatibility
  // page (see its own matchReportUnavailable gate). Generator/prompt code (match-report.*)
  // is deliberately left in place, not deleted — kundli_milan's own sections 6-7 read
  // match-risks.ts directly. NOTE: this default only takes effect where no admin `feature_flags`
  // DB override already exists (DB row wins over this default — see resolveFeaturesForUser's
  // doc comment) — if this key was ever explicitly turned on via the admin panel, that override
  // needs flipping there too after deploy.
  {
    key: 'reports.match_report',
    label: 'Compatibility Match Report',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 5000,
  },
  // Both have a fully registered generator (real LLM narrative, full i18n) --
  // switched on 2026-07-31 at the user's explicit request, unlike the other
  // reports.* keys above which still ship dark pending a deliberate decision.
  {
    key: 'reports.numerology',
    label: 'Numerology Report',
    group: 'reports',
    defaultEnabled: true,
    defaultPricePaise: 9900,
  },
  {
    key: 'reports.name_change',
    label: 'Name Change Report',
    group: 'reports',
    defaultEnabled: true,
    defaultPricePaise: 4900,
  },
  // New report type, ships dark per the standing rule -- turn on from
  // Admin -> Features once checked end-to-end. Full paid report generator
  // (not the free /remedies page): karmic debts, Pakka Ghar, blind planets,
  // and a Lal Kitab natal remedy per classical planet, narrated by the LLM.
  {
    key: 'reports.remedies',
    label: 'Remedies Report (Lal Kitab)',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 9900,
  },
  // New report type, ships dark per the standing rule -- turn on from
  // Admin -> Features once checked end-to-end. Requires spouse birth details
  // (requiresPartner, like kundli_milan) and reads both charts' D7 Saptamsha,
  // Beeja/Kshetra sphutas and a dual-school child sequence. Its age-gated
  // children card (35+) is the specific thing to eyeball before enabling.
  {
    key: 'reports.progeny',
    label: 'Progeny Report',
    group: 'reports',
    defaultEnabled: false,
    defaultPricePaise: 9900,
  },
  // KP Year Ahead: a full Krishnamurti Paddhati reading of the 12 months from the day it is
  // generated — Placidus cuspal sub lords, significators, dasha/bhukti/antara timing and
  // slow-transit confirmation, plus up to 3 of the reader's own questions (screened for
  // death/suicide topics before any money moves). ₹101, shown against a ₹251 MRP.
  {
    key: 'reports.kp_annual',
    label: 'KP Year Ahead Report',
    group: 'reports',
    defaultEnabled: true,
    defaultPricePaise: 10100,
    defaultOriginalPricePaise: 25100,
  },
  // panchang
  {
    key: 'panchang.purchasePlan',
    label: 'Planning to Buy card',
    group: 'panchang',
    defaultEnabled: true,
  },
  // referral — payouts OUT to users, not prices charged to them. Registered
  // here (rather than as constants in users.repo.ts, where they used to live)
  // so the admin can tune the referral economics without a deploy, and so the
  // in-app copy can quote the live amount instead of a baked-in number.
  //
  // `enabled: false` on either bonus key pays 0 for that side, which is how the
  // referral programme is switched off — see `payoutOf()` in features.service.
  {
    key: 'referral.referrerBonus',
    label: 'Referral bonus — referrer',
    group: 'referral',
    defaultEnabled: true,
    defaultPricePaise: 10000,
  },
  {
    key: 'referral.refereeBonus',
    label: 'Referral bonus — new user',
    group: 'referral',
    defaultEnabled: true,
    defaultPricePaise: 5000,
  },
  // A ceiling, not a payout: total referral earnings one user may accumulate.
  // `enabled` is ignored for this key.
  {
    key: 'referral.earningsCap',
    label: 'Referral earnings cap (per user)',
    group: 'referral',
    defaultEnabled: true,
    defaultPricePaise: 200000,
  },
  // One-time thank-you credited the first time a user submits an in-app
  // rating. Same reasoning as the referral keys above — an admin-tunable
  // payout, not a hardcoded reward.
  {
    key: 'referral.feedbackReward',
    label: 'Feedback thank-you credit (one-time)',
    group: 'referral',
    defaultEnabled: true,
    defaultPricePaise: 5000,
  },
  // One-time Independence Day 2026 wallet top-up, claimed via a modal on
  // 15 August only (the date window is enforced in the route, not here).
  // `enabled: false` is the campaign kill switch — payoutOf() then returns 0
  // and the claim route responds 410, same mechanism as the referral/feedback
  // keys above.
  {
    key: 'referral.independenceBonus',
    label: 'Independence Day 2026 bonus (one-time)',
    group: 'referral',
    defaultEnabled: true,
    defaultPricePaise: 50000,
  },
  // One-time top-up for wallets under ₹100, claimed via a modal on the
  // campaign's IST date only (window + the balance ceiling are enforced in the
  // route). Same kill switch as the keys above: disabled ⇒ payoutOf() returns 0.
  {
    key: 'referral.topUpBonus',
    label: 'Running-low top-up bonus (one-time)',
    group: 'referral',
    defaultEnabled: true,
    defaultPricePaise: 10000,
  },
  // Daily login streak, day 1 of 7 — see rewards.service.ts for the ladder
  // math (each day after this adds the rewards.dailyStep amount below).
  // `enabled: false` is the payout kill switch, same
  // mechanism as the other referral keys — nav.rewards above is the separate
  // visibility switch.
  {
    key: 'rewards.dailyBase',
    label: 'Daily reward — day 1 amount',
    group: 'rewards',
    defaultEnabled: true,
    defaultPricePaise: 500,
  },
  // Added per day on top of the day-1 base as the ladder climbs (day N pays
  // base + (N-1) x this). A live payout, so it is tunable here rather than a
  // module constant in rewards.service.ts — see admin-price-is-honoured.spec.ts.
  {
    key: 'rewards.dailyStep',
    label: 'Daily reward — per-day step',
    group: 'rewards',
    defaultEnabled: true,
    defaultPricePaise: 100,
  },
  // Extra credit on top of day 7's ladder amount for completing a full
  // 7-day streak (₹11 + this = ₹32 on day 7, ₹77 total across the week).
  {
    key: 'rewards.streakBonus',
    label: 'Daily reward — 7-day streak bonus',
    group: 'rewards',
    defaultEnabled: true,
    defaultPricePaise: 2100,
  },
  // One-time payout for granting OS notification permission. Server-verified:
  // an FCM token cannot exist without the grant, so registering one is the
  // proof — see device-tokens.routes.ts. Ships dark like every new card.
  {
    key: 'rewards.notificationsGrant',
    label: 'Reward — enable notifications',
    group: 'rewards',
    defaultEnabled: false,
    defaultPricePaise: 2500,
  },
  // One-time payout for granting OS location permission. NOT server-verifiable
  // — we deliberately store no coordinates, so this trusts the client's word
  // (POST /v1/rewards/location-granted). Bounded: once per user, wallet credit
  // only. Enable this one knowing that.
  {
    key: 'rewards.locationGrant',
    label: 'Reward — enable location',
    group: 'rewards',
    defaultEnabled: false,
    defaultPricePaise: 2500,
  },
  // Wallet credit every new account starts with. Read once, at account
  // creation, by users.repo.ts's insertUser() through the GLOBAL resolver (a
  // brand-new account belongs to no group yet), and shown on the sign-in
  // screen via GET /v1/public/signup-bonus. `enabled: false` means new accounts
  // start at ₹0. Until 2026-09-24 this was a hard-coded ₹500 column default.
  {
    key: 'rewards.signupBonus',
    label: 'New-user signup bonus',
    group: 'rewards',
    defaultEnabled: true,
    defaultPricePaise: 20100,
  },
  // ai — model pickers, not toggleable product surface. See `modelOptions` on FeatureDef for
  // what the enabled toggle means on these rows (off = fall back to the global GEMINI_MODEL).
  //
  // 2026-09-30: the two palm keys offer the OpenAI models (via Omnirush, see
  // config/omnirush-models.ts) as well as Gemini, and ship ON with gpt-6-astra at low effort.
  // Measured that day on a real palm: gpt-6-astra traced the heart/head/life lines onto the
  // real creases, and its low-effort traces landed within 0.1-0.4% of the frame of its
  // default-effort ones in half the time (~50 s vs ~100 s); gpt-6-sol drew the life line along
  // the thumb's outline. Any Omnirush failure falls back to Gemini (GEMINI_MODEL).
  //
  // 2026-10-23 (owner): both moved to Gemini, which now reads the same contact sheet with the
  // same prompt and parser as Omnirush (timing marks and line confidence included). Measured that
  // day on two palm photos: 3.1 and 3.5 Flash-Lite put the heart line on the finger-base creases
  // and the life line on the little-finger side, and the gate let them through; 3.8 Flash placed
  // every line on its crease both times (~25 s, about Rs 1.5-2 a scan at $0.75/$3.75 per 1M).
  // So the scan uses 3.8 Flash, and the paid text (no pixels) the cheapest, 3.1 Flash-Lite
  // ($0.25/$1.50, about Rs 0.4 a reading).
  {
    key: 'ai.palmVisionModel',
    label: 'Palm — vision model (free scan: lines, mounts, timing marks)',
    group: 'ai',
    defaultEnabled: true,
    modelOptions: SELECTABLE_PALM_MODELS,
    defaultModel: 'oxion:gemini-3.7-flash',
  },
  {
    key: 'ai.palmInterpretModel',
    label: 'Palm — interpretation model (paid report text)',
    group: 'ai',
    defaultEnabled: true,
    modelOptions: SELECTABLE_PALM_MODELS,
    defaultModel: 'oxion:claude-opus-5',
  },
  // 2026-10-24 (owner): a model per purpose, all on Oxion (not Gemini). Picked by Claude, not yet
  // compared on real readings: scan = Gemini 3.7 Flash via Oxion (same family as the 3.8 Flash that
  // read real palms right, and the family that emits 0-1000 spatial points); paid report = the
  // strongest model (Pass-only, once a period, so the cost is small); typed answer = Claude Sonnet
  // (short, fast); translation = Gemini 3.7 Flash. When the Oxion key is missing or a call fails,
  // palm falls back to the Gemini default. A row already saved in Admin -> Features beats these.
  {
    key: 'ai.palmQuestionModel',
    label: "Palm — answer to the reader's typed question",
    group: 'ai',
    defaultEnabled: true,
    modelOptions: SELECTABLE_PALM_MODELS,
    defaultModel: 'oxion:claude-sonnet-5',
  },
  {
    key: 'ai.palmTranslateModel',
    label: "Palm — translation of the report into the reader's language",
    group: 'ai',
    defaultEnabled: true,
    modelOptions: SELECTABLE_PALM_MODELS,
    defaultModel: 'oxion:gemini-3.7-flash',
  },
  // 2026-08-28: the three highest-traffic/most-reasoning-heavy surfaces
  // (personalized horoscope, AI chat, paid reports) previously had NO model
  // picker at all — every one of them ran on the fixed global GEMINI_MODEL
  // (flash-lite) regardless of admin.model settings, since modelOf()/
  // modelForUser() were only ever wired to the two palm keys above. Ships
  // DISABLED per the standing rule for every key on this page — nothing
  // changes for anyone until a model is deliberately picked.
  {
    key: 'ai.horoscopeModel',
    label: 'Horoscope — daily/weekly/monthly/yearly generation model',
    group: 'ai',
    defaultEnabled: false,
    modelOptions: SELECTABLE_GEMINI_MODELS,
    defaultModel: 'gemini-3.8-flash',
  },
  {
    key: 'ai.chatModel',
    label: 'AI Chat — astrologer reply model',
    group: 'ai',
    defaultEnabled: false,
    modelOptions: SELECTABLE_GEMINI_MODELS,
    defaultModel: 'gemini-3.8-flash',
  },
  {
    key: 'ai.reportModel',
    label: 'Paid Reports — narrative generation model',
    group: 'ai',
    defaultEnabled: false,
    modelOptions: SELECTABLE_GEMINI_MODELS,
    // REPORT_PROFILE already defaults to REASONING_MODEL (config/llm.ts) when
    // this key is off/unset — 'gemini-3.1-pro-preview' here is only the option
    // pre-selected the FIRST time an admin opens this key's dropdown, not a
    // silent behavior change; see modelForReportProfile() in gemini-client.ts.
    defaultModel: 'gemini-3.1-pro-preview',
  },
  // 2026-10-24 owner: every report written before CONTENT_VERSION 7 (engine 2026.10.2 + real transit dates) is rebuilt free the first time its owner opens it; the reader waits on an "updating" screen. Owner chose ON at deploy; switching it off shows old reports as they are.
  {
    key: 'reports.refreshOldOnOpen',
    label: 'Rebuild old reports with the corrected chart when opened (free)',
    group: 'reports',
    defaultEnabled: true,
  },
  // owner picked Gemini 3.7 Flash on Oxion 2026-10-24; a Gemini id here (or the key switched off) skips Oxion.
  {
    key: 'ai.reportRefreshModel',
    label: 'Old-report rebuild — model tried first (Oxion), then Gemini free, then Gemini paid',
    group: 'ai',
    defaultEnabled: true,
    modelOptions: SELECTABLE_PALM_MODELS,
    defaultModel: 'oxion:gemini-3.7-flash',
  },

  // ---------------------------------------------------------------------------
  // 2026-09 roadmap. Every key ships OFF and carries tag 'new' (NEW badge +
  // filter on Admin -> Features). Try one by switching it on for a user group.
  // ---------------------------------------------------------------------------

  // Step 1 — Why Aroha is saying this, and Birth Time Confidence.
  // The 'Why?' button on Today's Reading and the horoscope areas (GET /v1/why).
  {
    key: 'home.whyAroha',
    label: 'Why? — chart evidence behind readings',
    group: 'home',
    defaultEnabled: false,
  },
  // The Birth Time Confidence card (GET /v1/birth-time) and its birth-time check.
  // Aroha Pass only: without the Pass the card shows a subscribe lock. Replaces
  // the older home.birthTimeRectify card wherever both are on.
  {
    key: 'home.birthTimeConfidence',
    label: 'Birth Time Confidence card (Aroha Pass only)',
    group: 'home',
    defaultEnabled: false,
  },

  // Step 2 — Astro Weather (GET /v1/astro-weather; no AI cost).
  {
    key: 'home.astroWeather',
    label: 'Astro Weather card + /weather page',
    group: 'home',
    defaultEnabled: false,
  },
  // The Listen button: a 10-second summary read by on-device TTS (no server audio).
  {
    key: 'home.astroWeatherListen',
    label: 'Astro Weather — Listen (spoken summary)',
    group: 'home',
    defaultEnabled: false,
  },
  // Your Day: the day's good and caution windows. Moved from Home to the Panchang
  // page on 2026-09-25; the key (and so its group) keeps its old name so admin and group
  // overrides carry over.
  {
    key: 'home.yourDay',
    label: 'Your Day timeline card on Panchang',
    group: 'home',
    defaultEnabled: false,
  },

  // Step 3 — Aroha Calendar (GET /v1/calendar; no AI cost).
  {
    key: 'nav.calendar',
    label: 'Aroha Calendar page + menu entry',
    group: 'nav',
    defaultEnabled: false,
  },
  // The next important window from the calendar. Moved from Home to the Panchang
  // page on 2026-09-25; the key (and so its group) keeps its old name so admin and group
  // overrides carry over.
  {
    key: 'home.nextWindow',
    label: 'Next important window card on Panchang',
    group: 'home',
    defaultEnabled: false,
  },

  // Step 4 — Life Timeline (GET /v1/timeline; no AI cost). Aroha Pass only:
  // without the Pass the page shows a subscribe lock.
  {
    key: 'nav.lifeTimeline',
    label: 'Life Timeline page (Aroha Pass only)',
    group: 'nav',
    defaultEnabled: false,
  },

  // Step 5 — Ask Aroha 2.0 and Talk to Aroha (same chat price as today).
  // Chat answers as cards built from the chart's own why factors, plus links to explore further.
  {
    key: 'chat.structuredAnswers',
    label: 'Ask Aroha 2.0 — card answers (factors, meaning, timeline, explore)',
    group: 'chat',
    defaultEnabled: false,
  },
  // Voice call trial (Durga Puja 2026, owner's decision): every user, Pass or not, gets
  // VOICE_TRIAL_MINUTES free once. Without a Pass the call stops there and shows the Pass lock.
  // ON by default; switching it off makes voice Pass-only again. See modules/voice/voice.service.ts.
  {
    key: 'chat.voiceTrial',
    label: 'Voice call — 3 free minutes once for every user (then the Pass)',
    group: 'chat',
    defaultEnabled: true,
  },
  // After a call that ran 30 s or more: "how was your call?" (stars, quick tags, comment). See voice.service.ts submitVoiceFeedback.
  {
    key: 'chat.voiceFeedback',
    label: 'Voice call — ask "how was your call?" when it ends',
    group: 'chat',
    defaultEnabled: false,
  },
  // Hands-free chat: dictation in, reply read aloud in the language it was written in. Uses the normal per-question price.
  {
    key: 'chat.voiceMode',
    label: 'Talk to Aroha — speak a question, hear the reply',
    group: 'chat',
    defaultEnabled: false,
  },

  // Step 6 — Decision Astrology and Find My Date (both Aroha Pass only: without
  // the Pass each page shows a subscribe lock).
  // A /decide page: pick a decision, get favourable and caution windows plus the strongest dates, with the chart reasons. Rule-based, no AI cost.
  {
    key: 'nav.decisions',
    label: 'Decision Astrology — when to act on a big choice (Aroha Pass only)',
    group: 'nav',
    defaultEnabled: false,
  },
  // A /find-date page: category, place and range give the best dates with the best time of day, in that place's own timezone. Rule-based, no AI cost.
  {
    key: 'panchang.findMyDate',
    label: 'Find My Date — best day and time for a beginning (Aroha Pass only)',
    group: 'panchang',
    defaultEnabled: false,
  },

  // Step 7 — Aroha Bonds (Aroha Pass only: without the Pass the page and the
  // Home card show a subscribe lock).
  // A /bonds page: Guna Milan for partners, a harmony score for family and friends, where each bond stands now from both people's dashas, and each bond's periods ahead, communication and dates. Also shows the Business partner relationship when adding a profile. Rule-based, no AI cost.
  {
    key: 'nav.bonds',
    label: 'Aroha Bonds — compatibility and phase with each saved person (Aroha Pass only)',
    group: 'nav',
    defaultEnabled: false,
  },
  {
    key: 'home.bondsCard',
    label: 'Aroha Bonds card on Home',
    group: 'home',
    defaultEnabled: false,
  },

  // Step 8 — Astro Journal (free; notes and life events stored encrypted).
  // A /journal page: rate mood, energy, career, relationships and money, add a note and big life events; see your own patterns by dasha period and by the day's tara. Life events can feed Birth Time Confidence. Free, no AI cost.
  {
    key: 'nav.journal',
    label: 'Astro Journal — daily check-in with patterns by dasha and star',
    group: 'nav',
    defaultEnabled: false,
  },
  {
    key: 'home.journalPrompt',
    label: 'Astro Journal — "How was today?" card on Home',
    group: 'home',
    defaultEnabled: false,
  },

  // Daily Stories (free; no AI cost, no new route).
  // The Home avatar gets a story ring that glows until today's stories are seen: today's Panchang, the best Hora, the weekday's deity with its mantra, and a Gita verse, each with a Share button. Built in the frontend from GET /v1/astro/panchang and GET /v1/gita/verses.
  {
    key: 'home.dailyStories',
    label: 'Daily Stories — story ring on the Home avatar (Panchang, Hora, Deity, Gita)',
    group: 'home',
    defaultEnabled: false,
  },

  // Birth-time question (audit 2026-10-28, M7; free, no AI cost).
  // A one-time sheet for a reader who typed a birth time but never said how sure it is (accuracy not set): from a record, a family memory, or not sure. The answer is saved with the normal profile update; chat, voice and reports then hedge the time correctly. A rated profile is never asked again; "Not now" waits two weeks.
  {
    key: 'home.birthTimeAsk',
    label: 'Birth-time question — asks once where the birth time comes from',
    group: 'home',
    defaultEnabled: false,
  },

  // Step 9 — Today's Practice (free).
  // A /practice page: today's horoscope mantra, 108 japs for your running dasha lord, the weekday's prayer, and a Lal Kitab remedy on hard Moon days, each with its reason, chanted on the app's mala. A plain streak, no points. Free, no AI cost.
  {
    key: 'nav.dailyPractice',
    label: "Today's Practice — daily mantras and remedy with reasons",
    group: 'nav',
    defaultEnabled: false,
  },

  // Step 10 — Question Packs and the Aroha Pass (all off; the Pass stays off until you decide).
  // Prepaid chat questions bought from the wallet. Chat spends Pass questions first, then pack questions, then the wallet.
  {
    key: 'paid.questionPackSmall',
    label: 'Question Pack — 10 chat questions',
    group: 'paid',
    defaultEnabled: false,
    defaultPricePaise: 4900,
  },
  {
    key: 'paid.questionPackMedium',
    label: 'Question Pack — 24 chat questions',
    group: 'paid',
    defaultEnabled: false,
    defaultPricePaise: 9900,
  },
  {
    key: 'paid.questionPackLarge',
    label: 'Question Pack — 60 chat questions',
    group: 'paid',
    defaultEnabled: false,
    defaultPricePaise: 19900,
  },
  // A /pass page with the three Passes: Silver, Gold and Platinum. Each gives chat questions per 30 days, some of the Pass-only features and a discount on reports (what each tier gives is fixed in modules/pass/pass.config.ts). Google Play subscription only (Android, app 1.13+) — never paid from the wallet. Needs at least one tier (paid.arohaPassA/B/C) on too, and the aroha_pass_monthly subscription set up in Play Console. Users see every tier that is ON and pick one.
  {
    key: 'nav.arohaPass',
    label: 'Aroha Pass — monthly Google Play subscription',
    group: 'nav',
    defaultEnabled: false,
  },
  // The "Aroha Pass is here" popup on Home, with a button to /pass. Shown once to each user who has no Pass, and only while nav.arohaPass is on with at least one tier. A new user does not get it on their first visit: it waits for the second.
  {
    key: 'home.passLaunchPopup',
    label: "Aroha Pass launch popup on Home (once per user, from a new user's second visit)",
    group: 'home',
    defaultEnabled: false,
  },
  // Silver: 30 questions, Life Timeline, Bonds, 20% off reports. The price here is only what the app shows; Google Play charges the base plan's own price, set in Play Console (base plan pass-199) — keep them the same.
  {
    key: 'paid.arohaPassA',
    label: 'Aroha Pass Silver — 30 questions, Life Timeline, Bonds, 20% off reports',
    group: 'paid',
    defaultEnabled: false,
    defaultPricePaise: 19900,
  },
  // Gold: 60 questions, everything in Silver plus Decisions, Find My Date and the birth-time check, 30% off reports. Play base plan pass-299.
  {
    key: 'paid.arohaPassB',
    label:
      'Aroha Pass Gold — 60 questions, adds Decisions, Find My Date, birth-time check, 30% off reports',
    group: 'paid',
    defaultEnabled: false,
    defaultPricePaise: 29900,
  },
  // Platinum: 120 questions, everything in Gold plus Relocation, 40% off reports. Play base plan pass-399.
  {
    key: 'paid.arohaPassC',
    label: 'Aroha Pass Platinum — 120 questions, adds Relocation, 40% off reports',
    group: 'paid',
    defaultEnabled: false,
    defaultPricePaise: 39900,
  },

  // Step 11 — Digital Yantras & Wallpapers.
  // A /yantra page: the graha your chart needs now (running Mahadasha lord, or a weak benefic by Shadbala), its classical Navagraha number square, beej mantra, colours and your birth nakshatra. Rule-based, no AI cost.
  {
    key: 'nav.digitalYantra',
    label: 'Digital Yantra — a personal yantra from your chart',
    group: 'nav',
    defaultEnabled: false,
  },
  {
    key: 'paid.digitalYantra',
    label: 'Digital Yantra — print-ready yantra image',
    group: 'paid',
    defaultEnabled: false,
    defaultPricePaise: 4900,
  },
  {
    key: 'paid.digitalWallpaper',
    label: 'Digital Yantra — phone wallpaper',
    group: 'paid',
    defaultEnabled: false,
    defaultPricePaise: 2900,
  },

  // Step 12 — Aroha Relocation (Aroha Pass only: without the Pass the page shows a subscribe lock).
  // A /relocation page: pick up to five places anywhere in the world and compare them with your birth place across career, relationships, finance, education, family and lifestyle, with the reasons. Blocked while birth-time confidence is low. Rule-based, no AI cost.
  {
    key: 'nav.relocation',
    label: 'Aroha Relocation — compare cities for career, love, money and more (Aroha Pass only)',
    group: 'nav',
    defaultEnabled: false,
  },

  // Report book (2026-10-24): a finished report opens as a book you turn by hand, with a cover
  // carrying the reader's name, chapter art and graphs. Client-only (no API to gate), so this just
  // shows or hides the "Read as a book" button. Ships dark per the standing rule.
  {
    key: 'nav.reportBook',
    label: 'Report book — open a report as a page-turning book',
    group: 'nav',
    defaultEnabled: false,
  },

  // The book's handwriting: the reader's name on the cover and the pull-quotes are set in a
  // handwriting font (Kalam, Latin + Devanagari). A separate switch from the book itself, so it
  // can be turned on or off alone; off, those accents are an italic serif. Ships dark.
  {
    key: 'nav.reportBookHandwriting',
    label: 'Report book — handwriting style for the cover name and pull-quotes',
    group: 'nav',
    defaultEnabled: false,
  },

  // Palmistry V2 (2026-10). Each switch is one part of the new pipeline, so it can be tried on
  // an admin group and compared with the old behaviour on real scans before it reaches anyone.
  // The thresholds behind the first three are not yet calibrated on a review set of real palms.
  {
    key: 'palm.strictGate',
    label: 'Palm — strict line gate (inner-palm outline from the hand points, tighter thresholds)',
    group: 'palm',
    defaultEnabled: false,
  },
  {
    key: 'palm.biometricOverride',
    label: 'Palm — measured finger/thumb/palm shape replaces the model’s guess',
    group: 'palm',
    defaultEnabled: false,
  },
  {
    key: 'palm.autoCapture',
    label: 'Palm — camera takes the photo by itself once the hand is steady and sharp',
    group: 'palm',
    defaultEnabled: false,
  },

  // =========================================================================
  // money — Aroha Coins and the v7 price offers (Sprint 1 of the v7 build)
  // =========================================================================
  // 1 Aroha Coin = ₹1 = 100 paise, so the wallet itself does not change. Every switch in this
  // group ships OFF (owner's rule, 2026-10-18) and does nothing while off. Turn each on from
  // Admin -> Features, or enable it for an admin user group first to try it.
  {
    key: 'money.coins',
    label:
      'Aroha Coins — show 🪙 coins instead of ₹ everywhere in the app (₹ stays only on the payment sheet)',
    group: 'money',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'money.coinPacks',
    label:
      'Coin packs — the 4 packs (100 / 330 / 700 / 1,800 coins) replace the current top-up amounts',
    group: 'money',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'money.razorpayIntl',
    label:
      'Razorpay for coins and the Pass on the website in USD / EUR / GBP and more (needs Razorpay International Payments)',
    group: 'money',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'money.signupDrip',
    label:
      'Signup bonus in 3 stages (day 1, first check-in on a later day, first extra profile) instead of all at once',
    group: 'money',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  // The three stage amounts. Used only while money.signupDrip is on; an amount set to 0 or its
  // toggle turned off skips that stage.
  {
    key: 'money.signupFirst',
    label: 'Signup bonus stage 1 — on signup (amount only)',
    group: 'money',
    defaultEnabled: true,
    defaultPricePaise: 10100,
  },
  {
    key: 'money.signupSecond',
    label: 'Signup bonus stage 2 — first check-in on a later day (amount only)',
    group: 'money',
    defaultEnabled: true,
    defaultPricePaise: 5000,
  },
  {
    key: 'money.signupThird',
    label: 'Signup bonus stage 3 — first extra profile added (amount only)',
    group: 'money',
    defaultEnabled: true,
    defaultPricePaise: 5000,
  },
  {
    key: 'money.freeProfiles',
    label: 'Extra profiles — the first 3 are free, then the price below (free with Aroha Pass)',
    group: 'money',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'money.profileExtra',
    label: 'Extra profile after the free ones (amount only)',
    group: 'money',
    defaultEnabled: true,
    defaultPricePaise: 9900,
  },
  {
    key: 'money.houseOffer',
    label:
      'House insights — house 1 and the current dasha house free, single houses and an all-12 bundle at the prices below',
    group: 'money',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'money.houseSingle',
    label: 'One house, while the house offer is on (amount only)',
    group: 'money',
    defaultEnabled: true,
    defaultPricePaise: 2500,
  },
  {
    key: 'money.houseBundle',
    label: 'All 12 houses in one go, while the house offer is on (amount only)',
    group: 'money',
    defaultEnabled: true,
    defaultPricePaise: 14900,
  },
  {
    key: 'money.voiceSlices',
    label:
      'Voice calls: pay in 15-second slices after the free minutes (an early hang-up gives the unused slices back), and a gentler silence rule (asks after 10 s, hangs up after 15 s)',
    group: 'money',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'money.voiceSlice',
    label: 'Voice call, per 15 seconds, while slices are on (amount only)',
    group: 'money',
    defaultEnabled: true,
    defaultPricePaise: 500,
  },
  {
    key: 'money.passCoins',
    label: 'Aroha Pass monthly coin gift — Gold 100, Platinum 200 each month',
    group: 'money',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'money.refundKeys',
    label:
      "One refund per charge — chat, reports, palm, Vastu and yantra refunds carry the charge's key, so a failed job can never be refunded twice",
    group: 'money',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'money.platinumReport',
    label:
      'Platinum Pass — one report free every Pass month (a single report; a failed one gives the free report back)',
    group: 'money',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'money.razorpayPass',
    label:
      'Aroha Pass on the website through Razorpay Subscriptions (renews monthly, cancel any time on the Pass page; needs the Razorpay plan ids on the server)',
    group: 'money',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'money.storekit',
    label:
      'iPhone: Aroha Pass and coin packs through the App Store (needs the iOS app with in-app purchases and the App Store products set up)',
    group: 'money',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  // =========================================================================
  // experience — the two looks and the Home order (Sprint 2 of the v7 build)
  // =========================================================================
  {
    key: 'experience.homeLayout',
    label:
      'Home card order set by the owner (Admin → Home Layout) — switched on for an admin user group only, that group sees the draft; switched on for everyone, everyone sees the published order',
    group: 'experience',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'experience.travelPill',
    label:
      'Travel pill — when the phone is in another time zone than home, offer to show Panchang and daily times for where the user is (they can keep home instead)',
    group: 'experience',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'experience.nriMode',
    label:
      'NRI mode — a Settings switch for people living outside India: Panchang shows local times beside Delhi (IST)',
    group: 'experience',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'nav.pills',
    label:
      'Sub-tab pills — under each of the five tabs, a short row of the related pages (Today / Birth chart / Journal, Forecast / Calendar / Timeline, Ask / Chat history / Decisions, Reports / Matching / My reports, Panchang / Find a date / Daily practice)',
    group: 'nav',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'nav.shortMenu',
    label:
      'Short menu — the side menu lists six places (Profile & Experience, Chat history, Transactions, Rewards, Help, Settings) and folds every other page under "More"',
    group: 'nav',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'nav.coachMarks',
    label:
      'Coach marks — the first-visit Home walk-through is cut from eight steps to three (welcome, Ask, Kundli)',
    group: 'nav',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'experience.signShift',
    label:
      "Why your sign can be different — a Kundli card with the reader's own Western and Vedic Sun and Moon side by side (says so when a sign does not change)",
    group: 'experience',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'experience.wheelChart',
    label:
      '360° wheel chart — a third chart style beside North and South on the Kundli page (the default in the Modern Cosmic look)',
    group: 'experience',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'experience.picker',
    label:
      'Choose your experience — every user picks Classic Vedic or Modern Cosmic once (onboarding, or on next open for existing users); Settings then allows one free change and one every 30 days',
    group: 'experience',
    defaultEnabled: false,
    tag: 'new',
  },
  {
    key: 'experience.testSwitch',
    label:
      'Test switch — for a test group only: its members can change between the Indian and the international look at any time, with no waiting and without using up their real free change',
    group: 'experience',
    defaultEnabled: false,
    tag: 'new',
  },
  // =========================================================================
  // live / ritual / circles — Now Bar, Morning Ritual, Cosmic Circles (Sprint 3 of the v7 build)
  // =========================================================================
  {
    key: 'live.nowBar',
    label:
      'Now Bar — a Home card with what is running right now where the reader is: the hora, the choghadiya, whether Rahu Kaal is on, and the next good window (refreshed every 15 minutes)',
    group: 'live',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'live.widget',
    label:
      'Home-screen widget feed — the small /v1/widgets/live-now answer the Android widget reads (needs the 1.17 app build for the widget itself)',
    group: 'live',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'ritual.morning',
    label:
      'Morning Ritual — a daily Prashna card, 11 japs or 3 breaths and a mood check; completing it counts as the daily check-in (one merged streak, with a shield for a missed day and a Cosmic Key every 3rd day)',
    group: 'ritual',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'ritual.keyCoins',
    label: 'Cosmic Key, coins paid on every 3rd ritual day (amount only)',
    group: 'ritual',
    defaultEnabled: true,
    defaultPricePaise: 1000,
  },
  {
    key: 'circles.circles',
    label:
      'Cosmic Circles — a circle of up to 12 people from the saved profiles, each with a daily pulse (compatibility plus the Moon of the day); adding the first person pays signup stage 3',
    group: 'circles',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'circles.invite',
    label:
      'Circle invite links — share /circle/invite/<code>; when a friend accepts, the two accounts are linked, the inviter gets signup stage 3 and no profile slot is used',
    group: 'circles',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'circles.pulse',
    label:
      'Circle pulse push — one push a day (outside quiet hours) about the member whose day stands out; the pulse itself shows in the circle either way',
    group: 'circles',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  // =========================================================================
  // hooks — the eight daily-return features (Sprint 6 of the v7 build). Four are built for the Indian look
  // (Classic Vedic) and four for the international look (Modern Cosmic); the owner can open any of them to
  // the other section on the board. Each ships off and has its own switch.
  // =========================================================================
  {
    key: 'hooks.kundliRahasya',
    label:
      'Kundli Rahasya — 17 scrolls about your own chart, one opens each day (the next one at 8 PM after the morning ritual; any scroll early for a few coins, free with Gold and Platinum)',
    group: 'hooks',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'hooks.shubhLabh',
    label:
      'Shubh-Labh radar — a 24-hour green/amber/red strip of the best windows for money matters, from the hora, choghadiya, Rahu Kaal and your own Tara and Moon strength; today is free, a 7-day view and a 5-minutes-before alarm cost coins',
    group: 'hooks',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'hooks.gharKavach',
    label:
      'Ghar Ka Kavach — each morning picks the family member who could use the most care today, with 11 beads of one planet to chant for them; a streak fills the Kalash and a family week unlocks a free summary',
    group: 'hooks',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'hooks.sankalpDiya',
    label:
      "Sankalp Diya — light a diya in the day's best window (Abhijit; on Wednesdays Amrit or Shubh), a streak, a real count of diyas lit that day (hidden under 20) and a small coin gift on Ekadashi, Pradosh, Purnima and Amavasya",
    group: 'hooks',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'hooks.cosmicReceipts',
    label:
      "Cosmic Receipts — three timed cards a day (morning, afternoon, evening) from the Moon's aspects to your natal planets, each with its degree proof; an evening check-in (Nailed / Partly / Missed) and a share image",
    group: 'hooks',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'hooks.textTiming',
    label:
      'Text them now? — a green/amber/red timing suggestion for a saved profile (partner, crush, friend) with the best stretch of the day and a four-card decoder; an alert at the peak costs coins',
    group: 'hooks',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'hooks.sleepSync',
    label:
      'Sleep Sync — rate last night 1-5 and see it beside the Moon nakshatra; after 7 nights your top and bottom nakshatras; a 30-day pattern report costs coins (manual log only, no health claims)',
    group: 'hooks',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'hooks.mysteryDrop',
    label:
      'Mystery Synastry — one scratch card a day (6 PM) revealing which person in your circle has the strongest evening link with you, with the reason; with nobody in the circle yet, a public chart with a recorded birth time',
    group: 'hooks',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'home.timeMorph',
    label:
      'Time-of-day Home — the Home hero follows the morning / midday / evening / night slots set in Admin -> Home Layout, and a hook card is brought to the front when its moment arrives',
    group: 'home',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  // Amounts for the hooks (coins; 100 paise = 1 coin). A price key only matters while its feature is on.
  {
    key: 'hooks.rahasyaUnlock',
    label: 'Open a Kundli Rahasya scroll early, coins (free with Gold and Platinum)',
    group: 'hooks',
    defaultEnabled: true,
    defaultPricePaise: 1500,
  },
  {
    key: 'hooks.wealthWeek',
    label: '7-day Shubh-Labh view with alarms, coins',
    group: 'hooks',
    defaultEnabled: true,
    defaultPricePaise: 1500,
  },
  {
    key: 'hooks.peekTomorrow',
    label: "Peek at tomorrow's Cosmic Receipts, coins",
    group: 'hooks',
    defaultEnabled: true,
    defaultPricePaise: 1500,
  },
  {
    key: 'hooks.textAlert',
    label: 'Text-peak alert, coins',
    group: 'hooks',
    defaultEnabled: true,
    defaultPricePaise: 1500,
  },
  {
    key: 'hooks.sleepReport',
    label: '30-day sleep pattern report, coins',
    group: 'hooks',
    defaultEnabled: true,
    defaultPricePaise: 4900,
  },
  {
    key: 'hooks.diyaReward',
    label: 'Sankalp Diya gift on Ekadashi, Pradosh, Purnima and Amavasya, coins (amount only)',
    group: 'hooks',
    defaultEnabled: true,
    defaultPricePaise: 500,
  },
  // =========================================================================
  // memory / chat.personas / community / lang — Baba Ji memory, guides, Same Sky rooms, languages (Sprint 4 of the v7 build)
  // =========================================================================
  {
    key: 'memory.babaMemory',
    label:
      'Baba Ji memory — remembers dated events the reader mentions (an interview, an exam, a trip) and, once, the morning after, checks in with a push outside quiet hours; the first reply to that check-in is free',
    group: 'memory',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'memory.vault',
    label:
      'Memory Vault — the reader sees everything Baba Ji remembers and can delete one item or forget everything (Settings)',
    group: 'memory',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'memory.rectifyChip',
    label:
      'Sharpen birth time chip — after the reader confirms a past event happened, offers the birth-time check (when the birth time is not marked exact)',
    group: 'memory',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'chat.personas',
    label:
      'Guide personas — the reader picks who answers in chat: Yogi Baba, Pandit Vikram, Gauri, Kavitha Ji (Classic look) or Orion, Soren, Maya, Elena (Modern Cosmic look)',
    group: 'chat',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'community.sameSky',
    label:
      'Same Sky rooms — short posts in a room for readers who share the same Moon sign. Every post is checked first, can be reported, an author can be blocked, and the admin queue (Admin → Same Sky) has the last word',
    group: 'community',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'lang.localNames',
    label:
      "Tithi and nakshatra names in the reader's own language, in all 15 languages (today they show in English outside the 7 hand-written languages)",
    group: 'lang',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'lang.gitaScripts',
    label:
      'Bhagavad Gita transliteration — each verse can be read in Bengali, Gujarati, Telugu, Tamil or Kannada script, or in Latin letters (IAST); the Sanskrit stays as it is',
    group: 'lang',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  {
    key: 'lang.pushAll',
    label:
      "Notifications in all 15 languages — the recurring pushes (daily and weekly readings, transit alerts, check-ins, circle pulse) use the reader's own language also for Kannada, Spanish, French, German, Portuguese, Italian, Russian and Japanese",
    group: 'lang',
    defaultEnabled: false,
    defaultAudience: 'cosmic',
    tag: 'new',
  },
  // Google Play refunds (2026-10-24). Every refund is found and recorded either way
  // (Admin -> Play refunds, Telegram). Off: nothing is taken back. On: the refunded
  // money or questions are taken back, even below zero, reports bought with it lock
  // until paid, and a second refund blocks purchases. Not a price.
  {
    key: 'paid.refundClawback',
    label:
      'Take back Google Play refunds (wallet, question packs, reports; block repeat refunders)',
    group: 'paid',
    defaultEnabled: false,
  },
] as const;

const FEATURE_KEY_SET: ReadonlySet<string> = new Set(FEATURE_REGISTRY.map((f) => f.key));

export function isKnownFeatureKey(key: string): boolean {
  return FEATURE_KEY_SET.has(key);
}

/**
 * A saved model only counts while the key still offers it. A row naming a model that was since
 * dropped from `modelOptions` (e.g. the retired 'gemini-3.1-flash', which never existed) resolves
 * to null, i.e. the global default model, rather than failing every request for that feature.
 */
export function offeredModel(key: string, model: string | null): string | null {
  if (model == null) return null;
  const def = FEATURE_REGISTRY.find((f) => f.key === key);
  return def?.modelOptions?.includes(model) ? model : null;
}
