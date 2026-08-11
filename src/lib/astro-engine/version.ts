/**
 * Hand-maintained version tags for the calculation pipeline — nothing derives these
 * automatically (hashing source files sounds tidier but bumps on comment edits and
 * formatting, causing mass pointless regeneration of every cached chart in prod).
 *
 * Bump CALCULATION_VERSION deliberately whenever any of: planetary position math,
 * ayanamsa implementation, house calculation, node calculation, divisional-chart
 * derivation, dasha math, or yoga detection changes. It's folded into every cached
 * kundli's birthHash (see kundli.service.ts's birthInputsForProfile) — a bump makes
 * every existing birthHash stop matching, so the next access regenerates automatically,
 * with no backfill script or cache purge needed.
 *
 * EPHEMERIS_VERSION must be kept in sync with the pinned `swisseph-wasm` version in
 * package.json (deliberately pinned, not a caret range, so the resolved ephemeris can't
 * silently drift underneath a cached chart on a routine `npm install`).
 */
export const CALCULATION_VERSION = '2026.08.1';
export const EPHEMERIS_VERSION = 'swisseph-wasm@0.0.5';

/**
 * The versions in effect when versioning was INTRODUCED — i.e. the ones every kundli
 * already sitting in the database was computed with, before any version was recorded.
 *
 * These exist purely so introducing versioning did not itself invalidate the entire
 * cache. Every stored `birth_hash` was computed without a version key at all; naively
 * adding one would have changed every hash at once, and since a stale hash triggers a
 * full regeneration (which also deletes that profile's horoscopes and re-fires its
 * house insights, both LLM-backed), the deploy would have stampeded every user's chart
 * through the engine and the shared Gemini quota — to produce byte-identical charts,
 * because the engine had not actually changed.
 *
 * So `birthInputsForProfile` omits the version from the hash while it still equals the
 * baseline (JSON.stringify drops undefined keys — the same trick `lunarNode` already
 * relies on there), leaving existing hashes byte-identical. The FIRST real bump makes
 * the key appear and invalidates everything, which is exactly the intended behaviour.
 *
 * Do NOT move these forward when bumping the constants above — that would silently
 * cancel the invalidation the bump exists to cause. They are a permanent record of the
 * pre-versioning baseline, not a mirror of the current version.
 */
export const HASH_BASELINE_CALCULATION_VERSION = '2026.08.1';
export const HASH_BASELINE_EPHEMERIS_VERSION = 'swisseph-wasm@0.0.5';
