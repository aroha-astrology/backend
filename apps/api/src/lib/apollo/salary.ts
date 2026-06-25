/**
 * Salary estimation for Apollo-enriched users.
 *
 * Two-tier:
 *  1. Curated company table (FAANG, top Indian IT, top consulting, etc.) —
 *     `confidence: 'known_company'`.
 *  2. Sector × seniority × country fallback when the company is unknown —
 *     `confidence: 'sector_average'`.
 *
 * Bands are heuristic — they exist to give the AI a soft income signal so it
 * doesn't talk to a CTO like a fresher. Numbers are NEVER quoted to the user.
 */

import companiesData from './companies.json';
import type { Sector, Seniority } from './derive';

type Bands = Partial<Record<Seniority, number>>;
type CompanyEntry = { canonical: string; aliases: string[]; bands: Bands };
type SectorAverages = Record<string, Record<Sector, Bands>>;

const COMPANIES = companiesData.companies as CompanyEntry[];
const SECTOR_AVERAGES = companiesData.sectorAverages as SectorAverages;

const ALIAS_INDEX: Map<string, CompanyEntry> = (() => {
  const map = new Map<string, CompanyEntry>();
  for (const entry of COMPANIES) {
    map.set(entry.canonical.toLowerCase(), entry);
    for (const alias of entry.aliases) map.set(alias.toLowerCase(), entry);
  }
  return map;
})();

export type SalaryEstimate = {
  inr: number | null;
  confidence: 'known_company' | 'sector_average' | 'unknown';
};

export function estimateSalaryInr(args: {
  companyName: string | null;
  sector: Sector | null;
  seniority: Seniority | null;
  country: string | null;
}): SalaryEstimate {
  const seniority: Seniority = args.seniority ?? 'mid';

  if (args.companyName) {
    const key = args.companyName.toLowerCase().trim();
    const direct = ALIAS_INDEX.get(key);
    const fuzzy = direct ?? lookupFuzzy(key);
    const band = fuzzy?.bands[seniority];
    if (fuzzy && typeof band === 'number') {
      return { inr: band, confidence: 'known_company' };
    }
  }

  if (args.sector) {
    const countryKey = normalizeCountry(args.country);
    const sectorTable = SECTOR_AVERAGES[countryKey];
    const band = sectorTable?.[args.sector]?.[seniority];
    if (typeof band === 'number') {
      return { inr: band, confidence: 'sector_average' };
    }
  }

  return { inr: null, confidence: 'unknown' };
}

function lookupFuzzy(rawKey: string): CompanyEntry | null {
  // Strip Pvt Ltd / Inc / LLC / Limited suffixes so "Infosys Limited" matches "infosys".
  const stripped = rawKey
    .replace(/\b(pvt|private|ltd|limited|inc|llc|corp|corporation|plc|gmbh|sa|nv|company|co)\b\.?/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped && ALIAS_INDEX.has(stripped)) return ALIAS_INDEX.get(stripped) ?? null;

  // Token-overlap fallback — match the longest alias that is fully contained
  // in the input. Avoids spurious hits like "icici" matching "ICICI Lombard".
  let best: { entry: CompanyEntry; len: number } | null = null;
  for (const [alias, entry] of ALIAS_INDEX.entries()) {
    if (alias.length < 4) continue;
    if (stripped.includes(alias) && (best === null || alias.length > best.len)) {
      best = { entry, len: alias.length };
    }
  }
  return best?.entry ?? null;
}

function normalizeCountry(country: string | null): 'IN' | 'US' {
  if (!country) return 'IN';
  const lower = country.toLowerCase();
  if (lower === 'us' || lower === 'usa' || lower.includes('united states')) return 'US';
  return 'IN';
}
