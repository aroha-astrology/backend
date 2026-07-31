// =============================================================================
// Report generator barrel
// =============================================================================
// This codebase has no existing dynamic-plugin/registry-loader mechanism
// (every module in app.ts is a direct, explicit import) — so this barrel
// exists purely to give every report-type module ONE place to be imported
// for its self-registration side effect (see report-generator.types.ts's
// REPORT_GENERATORS doc comment). reports.service.ts imports this barrel
// (not the individual generator modules) so registration always runs before
// any purchase or read, regardless of which report key is requested first.
//
// All 14 catalogue keys are now registered here (kundli_milan was the original
// worked example; the next 9 were added in a later task; match_report is the
// paid Compatibility Match Report, reusing kundli_milan's scoring underneath
// its own 8 life-area cards; numerology/name_change are pure name+DOB math,
// no chart involved; remedies composes the previously-dormant Lal Kitab debts/
// Pakka Ghar/blind-planet/remedy-database modules). Nothing else in the
// reports feature needs to change to pick up a newly-registered key.
// =============================================================================

import './kundli-milan.generator.js';
import './marriage.generator.js';
import './past-life.generator.js';
import './true-love.generator.js';
import './wealth.generator.js';
import './baby-name.generator.js';
import './health-monthly.generator.js';
import './career-monthly.generator.js';
import './finance-monthly.generator.js';
import './relationship-monthly.generator.js';
import './match-report.generator.js';
import './numerology.generator.js';
import './name-change.generator.js';
import './remedies.generator.js';
