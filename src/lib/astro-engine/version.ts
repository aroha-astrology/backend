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
