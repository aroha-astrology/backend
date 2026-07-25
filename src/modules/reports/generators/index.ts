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
// All 10 catalogue keys are now registered here (kundli_milan was the original
// worked example; the other 9 were added in this task). Nothing else in the
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
