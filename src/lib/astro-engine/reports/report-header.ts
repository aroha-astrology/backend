// =============================================================================
// Report header — the identity summary shown at the top of every report
// =============================================================================
// A lightweight "who is this report about" fact block: name, Lagna, Moon
// sign/nakshatra, and the current Mahadasha/Antardasha (reusing whatever
// `LifeContext` the report already computed, never re-deriving the dasha
// tree a second time). Deliberately does NOT include birth date/time/place —
// `ReportScoreContext` only carries `personDob` as a bare date string (no
// time, no place; see that field's own doc comment), and threading birth
// time/place through every report generator's context would be a much
// bigger, unrelated change than this header needs. `personDob` itself IS
// shown when present, since it's already free.
// =============================================================================

import { calculateNakshatra } from '../panchang/nakshatra.js';
import { getPlanetPosition } from './chart-facts.js';
import type { LifeContext } from './report-life-context.js';

export interface ReportHeader {
  name: string | null;
  dob: string | null;
  lagnaSign: string | undefined;
  moonSign: string | undefined;
  moonNakshatra: string | undefined;
  currentMahadasha: string | null;
  currentAntardasha: string | null;
  dashaEndsOn: string | null;
}

export function buildReportHeader(
  chart: Record<string, unknown> | null,
  personName: string | null | undefined,
  personDob: string | null | undefined,
  lifeContext: LifeContext,
): ReportHeader {
  const ascendant = chart?.ascendant as Record<string, unknown> | undefined;
  const lagnaSign = typeof ascendant?.sign === 'string' ? ascendant.sign : undefined;

  const moon = getPlanetPosition('Moon', chart);
  const moonNakshatra =
    typeof moon?.longitude === 'number' ? calculateNakshatra(moon.longitude).name : undefined;

  return {
    name: personName ?? null,
    dob: personDob ?? null,
    lagnaSign,
    moonSign: moon?.sign,
    moonNakshatra,
    currentMahadasha: lifeContext.currentMahadasha,
    currentAntardasha: lifeContext.currentAntardasha,
    dashaEndsOn: lifeContext.endsOn,
  };
}
