// =============================================================================
// Vimshottari for KP timing — dasha / bhukti / antara over an arbitrary window
// =============================================================================
// The shared vimshottari.ts builds the whole 120-year tree for "now" and only
// expands the active branch. The annual KP report needs something narrower and
// exact: every antara (pratyantar) that touches the report year, from the KP-
// ayanamsa Moon. Same proportional rule, same 365.25-day year the rest of the
// engine uses (DASHA_YEAR_DAYS is stamped on the report so the convention is
// never implicit).
// =============================================================================

export const DASHA_YEAR_DAYS = 365.25;
const MS_PER_YEAR = DASHA_YEAR_DAYS * 86_400_000;
const NAKSHATRA_SPAN = 360 / 27;

const ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const YEARS: Record<string, number> = {
  Ketu: 7,
  Venus: 20,
  Sun: 6,
  Moon: 10,
  Mars: 7,
  Rahu: 18,
  Jupiter: 16,
  Saturn: 19,
  Mercury: 17,
};

export interface DashaSpan {
  md: string;
  ad: string;
  pd: string;
  /** ISO dates, end exclusive. */
  start: string;
  end: string;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Every Mahadasha-Antardasha-Pratyantar span overlapping [fromMs, toMs).
 * `birthMs` is the birth instant (UT), `moonLongitude` the sidereal Moon.
 */
export function antarasBetween(
  moonLongitude: number,
  birthMs: number,
  fromMs: number,
  toMs: number,
): DashaSpan[] {
  const lon = ((moonLongitude % 360) + 360) % 360;
  const nak = Math.min(Math.floor(lon / NAKSHATRA_SPAN), 26);
  const traversed = (lon - nak * NAKSHATRA_SPAN) / NAKSHATRA_SPAN;
  const firstIdx = nak % 9;
  const firstLord = ORDER[firstIdx]!;
  // The first Mahadasha "began" before birth by the traversed fraction — anchoring on that
  // virtual start lets every later level use the full proportional widths.
  let mdStart = birthMs - traversed * YEARS[firstLord]! * MS_PER_YEAR;

  const out: DashaSpan[] = [];
  for (let m = 0; m < 20 && mdStart < toMs; m++) {
    const md = ORDER[(firstIdx + m) % 9]!;
    const mdLen = YEARS[md]! * MS_PER_YEAR;
    const mdEnd = mdStart + mdLen;
    if (mdEnd > fromMs) {
      let adStart = mdStart;
      const mdIdx = ORDER.indexOf(md);
      for (let a = 0; a < 9; a++) {
        const ad = ORDER[(mdIdx + a) % 9]!;
        const adLen = (mdLen * YEARS[ad]!) / 120;
        const adEnd = adStart + adLen;
        if (adEnd > fromMs && adStart < toMs) {
          let pdStart = adStart;
          const adIdx = ORDER.indexOf(ad);
          for (let p = 0; p < 9; p++) {
            const pd = ORDER[(adIdx + p) % 9]!;
            const pdEnd = pdStart + (adLen * YEARS[pd]!) / 120;
            if (pdEnd > fromMs && pdStart < toMs) {
              out.push({ md, ad, pd, start: iso(pdStart), end: iso(pdEnd) });
            }
            pdStart = pdEnd;
          }
        }
        adStart = adEnd;
      }
    }
    mdStart = mdEnd;
  }
  return out;
}

export function spanAt(spans: DashaSpan[], date: string): DashaSpan | null {
  return spans.find((s) => s.start <= date && date < s.end) ?? null;
}
