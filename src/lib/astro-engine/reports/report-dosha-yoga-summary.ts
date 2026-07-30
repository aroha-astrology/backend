// =============================================================================
// Report dosha & yoga summary panel
// =============================================================================
// A small "what's going for you" / "what to hold carefully" panel built from
// the same two raw fields chat-grounding.ts already reads for its own
// grounding facts (`doshaFacts` and the `RELEVANT_YOGA_TYPES` yoga filter) —
// this module is a FRESH read of those same shapes for the reports feature,
// not an import from or edit to chat-grounding.ts (left untouched, per this
// task's constraints; read only as a reference pattern).
//
// Field shapes verified directly against chat-grounding.ts's `doshaFacts`
// function and `GroundingSource.doshas`/`GroundingSource.yogas` doc comments:
//   - doshaData: { mangal, kaalSarp, sadeSati, pitra, kemDruma, grahan, guruChandal }
//     Every dosha except sadeSati signals presence via `.present`; sadeSati
//     uniquely uses `.active` (Sade Sati is a currently-transiting condition,
//     not a fixed natal placement) — see DOSHA_HANDLERS below, which encodes
//     this per-key difference explicitly rather than assuming a uniform shape.
//   - yogaData: { yogas: Array<{ type, name, present, strength, description }> }
// =============================================================================

export interface DoshaYogaSummary {
  /** Present, favorable — "what's going for you." */
  positives: { label: string; detail: string }[];
  /** Present doshas needing awareness — "what to hold carefully." */
  cautions: { label: string; detail: string }[];
}

interface DoshaHandler {
  /** Fact-line label, e.g. "Mangal Dosha". */
  label: string;
  /** True if this dosha is present/active on the given per-dosha object. */
  isPresent: (dosha: Record<string, unknown>) => boolean;
  /** One-line detail string once presence is confirmed. */
  detail: (dosha: Record<string, unknown>) => string;
}

/**
 * One handler per traditional dosha key, mirroring chat-grounding.ts's `doshaFacts` field reads
 * exactly (field names, and which field signals presence, are NOT guessed — verified against that
 * function). Keyed by the same property name the dosha lives under on `doshaData` (e.g.
 * `doshaData.mangal`, `doshaData.kaalSarp`).
 */
const DOSHA_HANDLERS: Record<string, DoshaHandler> = {
  mangal: {
    label: 'Mangal Dosha',
    isPresent: (d) => Boolean(d.present),
    detail: (d) =>
      `${String(d.severity ?? 'unspecified')} severity, ${String(d.type ?? 'unspecified')} type`,
  },
  kaalSarp: {
    label: 'Kaal Sarp Dosha',
    isPresent: (d) => Boolean(d.present),
    detail: (d) =>
      `${String(d.name ?? d.type ?? 'present')}, ${String(d.severity ?? 'unspecified')} severity${
        d.isPartial ? ', partial' : ', full'
      }`,
  },
  // sadeSati signals presence via `.active`, not `.present` — a currently-transiting
  // condition rather than a fixed natal placement, matching chat-grounding.ts's own read.
  sadeSati: {
    label: 'Sade Sati',
    isPresent: (d) => Boolean(d.active),
    detail: (d) =>
      `${String(d.phase ?? 'unspecified')} phase, ${String(d.severity ?? 'unspecified')} severity`,
  },
  pitra: {
    label: 'Pitra Dosha',
    isPresent: (d) => Boolean(d.present),
    detail: (d) => `${String(d.severity ?? 'unspecified')} severity`,
  },
  kemDruma: {
    label: 'Kemdruma Dosha',
    isPresent: (d) => Boolean(d.present),
    detail: (d) => `${String(d.severity ?? 'unspecified')} severity`,
  },
  grahan: {
    label: 'Grahan Dosha',
    isPresent: (d) => Boolean(d.present),
    detail: (d) =>
      `${String(d.type ?? 'unspecified')}, ${String(d.severity ?? 'unspecified')} severity`,
  },
  guruChandal: {
    label: 'Guru Chandal Dosha',
    isPresent: (d) => Boolean(d.present),
    detail: (d) =>
      `house ${String(d.house ?? '?')}, ${String(d.severity ?? 'unspecified')} severity`,
  },
};

/**
 * Builds the "what's going for you" / "what to hold carefully" panel for a report from the raw
 * dosha/yoga JSON blobs, scoped to only the keys/types the calling report cares about.
 *
 * @param doshaData          `kundli.doshaData` as-is (`ReportScoreContext.doshaData`), or null.
 * @param yogaData            `kundli.yogaData` as-is (`ReportScoreContext.yogaData`), or null.
 * @param relevantDoshaKeys   Which of `DOSHA_HANDLERS`' keys matter for this report, e.g.
 *                            `['mangal', 'kaalSarp', 'sadeSati']` for a marriage report. An
 *                            unrecognized key (not one of mangal/kaalSarp/sadeSati/pitra/
 *                            kemDruma/grahan/guruChandal) is silently ignored, not an error.
 * @param relevantYogaTypes   Which `yoga.type` values matter for this report, e.g.
 *                            `['raja', 'dhana']`. Matches yogaData.yogas[].type exactly (the
 *                            same field chat-grounding.ts's `RELEVANT_YOGA_TYPES` filter reads).
 * @returns                   `{ positives, cautions }`. Never throws — missing/null/malformed
 *                            `doshaData`/`yogaData` (or a dosha/yoga entry not shaped as
 *                            expected) simply contributes nothing, yielding empty arrays rather
 *                            than a crash.
 */
export function computeDoshaYogaSummary(
  doshaData: Record<string, unknown> | null,
  yogaData: Record<string, unknown> | null,
  relevantDoshaKeys: string[],
  relevantYogaTypes: string[],
): DoshaYogaSummary {
  const cautions: DoshaYogaSummary['cautions'] = [];
  if (doshaData) {
    for (const key of relevantDoshaKeys) {
      const handler = DOSHA_HANDLERS[key];
      if (!handler) continue;
      const dosha = doshaData[key];
      if (!dosha || typeof dosha !== 'object') continue;
      const doshaObj = dosha as Record<string, unknown>;
      if (handler.isPresent(doshaObj)) {
        cautions.push({ label: handler.label, detail: handler.detail(doshaObj) });
      }
    }
  }

  const positives: DoshaYogaSummary['positives'] = [];
  const rawYogas = yogaData?.yogas;
  const yogas = Array.isArray(rawYogas) ? (rawYogas as Array<Record<string, unknown>>) : [];
  for (const yoga of yogas) {
    if (!yoga.present) continue;
    if (!relevantYogaTypes.includes(String(yoga.type))) continue;
    positives.push({
      label: String(yoga.name ?? yoga.type ?? 'Yoga'),
      detail: String(yoga.description ?? ''),
    });
  }

  return { positives, cautions };
}
