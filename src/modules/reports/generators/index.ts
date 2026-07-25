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
// A FOLLOWING task adds the other 9 report types: add each new generator
// module's import here (for its side effect only — no need to re-export
// anything) as it's built. Nothing else in the reports feature needs to
// change to pick up a newly-registered key.
// =============================================================================

import './kundli-milan.generator.js';
