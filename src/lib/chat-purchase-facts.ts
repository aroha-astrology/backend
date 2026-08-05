// =============================================================================
// Purchase-derived chat grounding
// =============================================================================
// The chat astrologer already gets a user's chart, dasha, doshas, panchang —
// but nothing about what they've already PAID FOR and READ. A user who spends
// ₹100 on a gemstone report recommending a specific stone, then asks chat
// "which stone should I wear?", got an answer chat re-derived from scratch —
// with no guarantee it agreed with the report the user already paid for and
// trusts. That is a trust bug on every report/gemstone/vastu/palm customer,
// not a missing nicety.
//
// This derives facts from data the app ALREADY STORES — purchased reports,
// unlocked houses, the gemstone recommendation, vastu plans, palm readings —
// at READ time, on every chat turn, the same way buildProfileFacts and
// buildMatchReportFacts (astro.service.ts) already do for their own sources.
// Deliberately NOT written into `user_facts`: that table is for durable facts
// the LLM extracts from conversation. Purchase history has its own source of
// truth (the reports/gemstone/vastu/palm tables themselves) and reading it
// fresh means no migration, no backfill, and no staleness the moment the user
// buys something new — unlike a cached copy, this can never drift from what
// was actually purchased.
//
// Every lookup below is best-effort: a failure here must never break the chat
// reply, so callers wrap this in the same `.catch(() => [])` pattern used for
// every other grounding source in astro.service.ts.
// =============================================================================

import { listReportsForUser } from '../modules/reports/reports.repo.js';
import { getReportDef } from '../config/reports.js';
import { findGemstoneRecommendation } from '../modules/gemstone/gemstone.repo.js';
import { listPlansForUser } from '../modules/vastu/vastu.repo.js';
import { listPalmReadingsForUser } from '../modules/palm/palm.repo.js';

/**
 * Minimal shape this module needs off the active profile — a subset of
 * ProfileContext. `unlockedHouses` is already normalized to `[]` (never null)
 * and already resolved correctly for BOTH the primary profile and an
 * additional saved one (see profile-context.ts) — no separate lookup against
 * the account row is needed.
 */
export interface PurchaseFactsProfile {
  unlockedHouses: number[];
}

/**
 * Everything the user has already bought and can reasonably be asked about,
 * as plain grounding lines — same shape as buildProfileFacts/
 * buildMatchReportFacts, appended into `extraFacts` alongside them.
 */
export async function buildPurchaseFacts(
  userId: string,
  birthProfileId: string | null,
  profile: PurchaseFactsProfile | undefined,
): Promise<string[]> {
  const [reports, gemstone, vastuPlans, palmReadings] = await Promise.all([
    listReportsForUser(userId, birthProfileId).catch(() => []),
    findGemstoneRecommendation(userId, birthProfileId).catch(() => undefined),
    listPlansForUser(userId, birthProfileId, 3).catch(() => []),
    listPalmReadingsForUser(userId, birthProfileId).catch(() => []),
  ]);

  const facts: string[] = [];

  // Purchased reports — title + when, so chat can say "as your Marriage
  // Report from last week covered..." instead of re-deriving from zero.
  for (const report of reports) {
    if (report.status !== 'ready') continue;
    const label = getReportDef(report.reportKey)?.label ?? report.reportKey;
    const when = report.createdAt.toISOString().slice(0, 10);
    facts.push(
      `User ALREADY PURCHASED and can read the "${label}" report (bought ${when}) — ` +
        `if they ask something that report covers, be consistent with what a report ` +
        `titled "${label}" would conclude rather than contradicting it.`,
    );

    // The report's own pre-purchase questionnaire, if the user filled one in
    // (see withAnswers in reports.service.ts — persisted under input.answers,
    // separate from partner birth fields). This is real, self-disclosed
    // context ("trying to conceive", "considering a job change") that used to
    // be thrown away after generating the one report it was collected for.
    const answers = (report.input as { answers?: Record<string, string> } | null)?.answers;
    if (answers && Object.keys(answers).length > 0) {
      const lines = Object.entries(answers)
        .map(([q, a]) => `${q}: ${a}`)
        .join('; ');
      facts.push(
        `When purchasing the "${label}" report, the user answered a short questionnaire: ${lines}`,
      );
    }
  }

  // Gemstone recommendation — the report's own intro already reasons about
  // which planets are strong/weak and how gemstones fit in; surfacing it (not
  // recomputing which stone is "best") is what keeps chat from contradicting
  // a stone the user was already told to wear.
  if (gemstone?.status === 'ready' && gemstone.analysis) {
    const analysis = gemstone.analysis as { intro?: string };
    if (analysis.intro) {
      facts.push(
        `User ALREADY UNLOCKED and read a personalized Gemstone Report. Its summary: ` +
          `"${analysis.intro}" — if asked about gemstones, stay consistent with this, ` +
          `don't produce a contradicting recommendation.`,
      );
    }
  }

  // Unlocked houses — a paid house unlock is a real signal of what the user
  // is anxious or curious about (7th house = marriage, 10th = career, etc.),
  // not something to re-ask about generically.
  const unlockedHouses = profile?.unlockedHouses ?? [];
  if (unlockedHouses.length > 0) {
    facts.push(
      `User has PAID to unlock detailed house insight for house(s): ${unlockedHouses.sort((a, b) => a - b).join(', ')}. ` +
        `They were curious enough about these specific life areas to pay for them — weight relevant topics accordingly.`,
    );
  }

  // Vastu — existence + score only (not the full room-by-room analysis,
  // which is large and rarely what a chat question is about).
  const doneVastu = vastuPlans.find((p) => p.status === 'done');
  if (doneVastu) {
    facts.push(
      `User has an ALREADY-GENERATED Vastu analysis of their home` +
        (doneVastu.overallScore != null ? ` (overall score ${doneVastu.overallScore}/100)` : '') +
        ` — if asked about their home/Vastu, be consistent with having already reviewed it.`,
    );
  }

  // Palm reading — existence only. Never surface image data, per the DSAR
  // export's own "no photograph bytes outside its own route" rule
  // (users.repo.ts collectUserExport) — this mirrors that same restraint.
  if (palmReadings.some((r) => r.status === 'ready')) {
    facts.push(
      `User has an already-completed AI palm reading — if asked about it, be consistent with having already reviewed their palm.`,
    );
  }

  return facts;
}
