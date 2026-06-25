// =============================================================================
// Adhik Maas (Purushottam Maas / Mol Maas / Mal Maas / Londa Maas) date ranges
// =============================================================================
// Mirrors supabase/migrations/035_panchang_adhik_maas.sql so the calendar can
// mark days locally without a per-day API hit. Verified against Drik Panchang.

export interface AdhikMaasRange {
  start: string;       // YYYY-MM-DD inclusive
  end: string;         // YYYY-MM-DD inclusive
  monthName: string;   // doubled lunar month (e.g., 'Jyeshtha')
  label: string;       // human-readable name (e.g., 'Adhik Jyeshtha 2026')
}

export const ADHIK_MAAS_RANGES: AdhikMaasRange[] = [
  { start: '2023-07-18', end: '2023-08-16', monthName: 'Shravana', label: 'Adhik Shravana 2023' },
  { start: '2026-05-17', end: '2026-06-15', monthName: 'Jyeshtha', label: 'Adhik Jyeshtha 2026' },
];

export function findAdhikMaas(isoDate: string): AdhikMaasRange | null {
  for (const range of ADHIK_MAAS_RANGES) {
    if (isoDate >= range.start && isoDate <= range.end) return range;
  }
  return null;
}

export function isAdhikMaas(isoDate: string): boolean {
  return findAdhikMaas(isoDate) !== null;
}
