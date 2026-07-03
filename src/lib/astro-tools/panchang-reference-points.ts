// =============================================================================
// Named reference points panchang is pre-warmed for.
//
// Panchang is location-dependent, so there is no single "India panchang" —
// every published panchang (Drik Panchang, Kalnirnay, etc.) is computed for
// some specific place. We do NOT scrape or redistribute any third-party
// panchang provider's output (that's their computed/published data, not ours
// to copy); instead we compute our own, with our own engine, for the 5
// reference points a plurality of Indian users are closest to by population
// (the 4 largest metros plus the national default already used by
// GET /astro/panchang when no lat/lon is given — Delhi/NCR). "Same for every
// user" means: cached once per (date, city) and reused for anyone whose
// resolved location snaps to one of these, not computed per-request.
// =============================================================================

export interface PanchangReferencePoint {
  key: string;
  label: string;
  lat: number;
  lon: number;
}

export const PANCHANG_REFERENCE_POINTS: PanchangReferencePoint[] = [
  { key: 'delhi', label: 'Delhi/NCR', lat: 28.6139, lon: 77.209 },
  { key: 'mumbai', label: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { key: 'kolkata', label: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { key: 'chennai', label: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { key: 'bengaluru', label: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
];

const SNAP_TOLERANCE_DEG = 0.05; // ~5km — close enough to treat as "at" the reference point

/** If (lat, lon) is within tolerance of a named reference point, return its key; else null. */
export function snapToReferencePoint(lat: number, lon: number): string | null {
  for (const point of PANCHANG_REFERENCE_POINTS) {
    if (
      Math.abs(lat - point.lat) <= SNAP_TOLERANCE_DEG &&
      Math.abs(lon - point.lon) <= SNAP_TOLERANCE_DEG
    ) {
      return point.key;
    }
  }
  return null;
}
