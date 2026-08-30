# Marriage Report Spouse Details — Design

**Goal:** for a married user (`relationshipStatus === 'married'`), collect real spouse birth
details before generating the marriage report, and have the report's content genuinely
reflect both charts — not just the user's own — reusing the two-person matching machinery
already built for Kundli Milan.

## Background

The marriage report today (`src/lib/astro-engine/reports/marriage.ts` +
`src/lib/llm/reports/marriage.ts`) is single-chart: scoring and all four narrative Gemini
calls read only the user's own chart/dasha/ashtakavarga/dosha data, regardless of marital
status.

A spouse-details form was tried once before (`frontend/components/reports/marriage/SpouseBirthCard.tsx`,
now just a link to `/compatibility`): it POSTed spouse answers into the marriage report's
generic `answers` field, which had no backend handler. The purchase row deduped, the wallet
was debited and then refunded, and no reading was ever produced. That gap is why this design
routes spouse data through the report system's existing first-class `partner` field instead
of a bolted-on answers blob.

That generic partner pipeline already exists end-to-end for reports where
`requiresPartner: true` (e.g. Kundli Milan): `PartnerBirthDetailsSchema` on the purchase
body → `validatePurchaseShape` → `hasPartnerBirthInput`/`partnerInputToBirthRecord` →
`buildReportScoreContext` populating `ctx.partnerChart`. Marriage currently has
`requiresPartner: false` and nothing reads `ctx.partnerChart`. No schema change is needed —
`reports.input` (jsonb) already stores partner details and already participates in the
existing content-hash dedupe.

## Frontend: modal

- In `ReportPurchaseDrawer.tsx`, when the report key is `marriage` and the purchasing user's
  `relationshipStatus === 'married'`, show a dedicated "Spouse Details" modal step before
  purchase (same slot in the flow as the existing `report-questions.ts`-driven questionnaire,
  but its own component — marriage intentionally has no entry in `REPORT_QUESTIONS`).
- Fields: name, date of birth, time of birth, place of birth — reusing the existing
  birth-detail input components (place autocomplete, time picker) for consistent validation.
- Pre-fill from the user's existing birth profile tagged `relationship: 'spouse'`, if one
  exists. The modal is always shown (not skipped) even when a spouse profile exists, so the
  user can correct/update it — this is the mechanism for the data to get better over time,
  not a one-time capture.
- On submit: values go into the purchase call's existing `partner` field (`PartnerBirthDetailsSchema`),
  not a new field. The same submit also upserts (create or update) the user's `spouse`-tagged
  birth profile with the entered values.
- Cancel/skip: falls back to today's self-only report — spouse data is an enhancement, not a
  hard requirement, so a married user is never blocked from generating the report.
- Unmarried users: entirely unaffected — no modal, no `partner` field sent, current behavior
  unchanged.

## Backend: partner-aware generation

- `validatePurchaseShape` (`reports.service.ts`): for `marriage`, require `partner` only when
  the purchasing user's `relationshipStatus === 'married'` — not unconditionally like
  `requiresPartner: true` reports (most users of this report are unmarried and are asking
  about a future spouse they can't provide details for).
- Chart computation: no new code — the existing `hasPartnerBirthInput` /
  `partnerInputToBirthRecord` / `buildReportScoreContext` pipeline already computes the
  partner chart into `ctx.partnerChart` generically across all four read/regenerate call
  sites.
- Scoring (`computeMarriageScores`): extend to optionally read `ctx.partnerChart`. Where it
  currently derives single-chart facts (7th-lord/Venus/Jupiter strength, partner archetype,
  in-laws, money-after-marriage, timing), add synastry facts computed against the spouse's
  actual chart by reusing `computeMatchRiskFactors` and `calculateDashakoota`/
  `calculateAshtakoota` (already built for Kundli Milan) rather than new astrology logic.
  When `ctx.partnerChart` is absent, behavior and output are unchanged from today.
- Narrative (`generateMarriageNarrative`, 4 Gemini calls): rework `buildFactsCall1-4` to
  include spouse facts and switch to "you"/"your spouse" framing when `ctx.partnerChart` is
  present, following the grounding-rule and pronoun convention already used in
  `src/lib/llm/reports/kundli-milan.ts`. Same call count, same sections. When
  `ctx.partnerChart` is absent, prompts are byte-identical to today.

## Edge cases

- Married, modal skipped: self-only report, exactly today's behavior.
- Regenerating an older report generated before this feature (no partner data in
  `reports.input`): renders self-only, as it always has.
- Relationship status changes after a report already exists (e.g. single → married later):
  does not retroactively change the existing report; a later regeneration/new purchase is
  a new purchase and goes through the yearly-report dedupe (`findActiveYearlyReportRow`)
  exactly as it does today.
- Charge/dedupe: spouse data rides the existing `partner` field, so it inherits
  `deductWalletBalance` (single charge before the per-row loop) and the yearly
  dedupe/auto-refund logic verbatim. This is the exact protection that didn't exist for the
  old `SpouseBirthCard.tsx` form and caused the debit/no-reading bug — the fix here is
  structural (use the field that already has this protection), not a new dedupe mechanism.

## Testing

- Backend unit: `computeMarriageScores` with and without `ctx.partnerChart` — self-only path
  must be byte-identical to current output; partner-present path must produce the added
  synastry facts.
- Backend unit: `validatePurchaseShape` — married + no partner validates (falls back);
  married + partner requires a valid `PartnerBirthDetailsSchema`; unmarried + partner sent
  anyway does not crash (ignored/rejected, not a 500).
- Frontend: modal renders only when `relationshipStatus === 'married'` on the marriage
  report card; pre-fills from an existing `spouse` birth profile when present; submitted
  values are passed through to `purchase()` as `partner`.
- Manual: generate a marriage report as a married test user with no saved spouse profile
  (modal empty, submit, verify a `spouse` birth profile is created), generate again for the
  same user (modal now pre-filled), and once as an unmarried user (no modal, report
  unchanged from current behavior).
