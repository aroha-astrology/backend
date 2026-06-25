import type { RegionId } from '@aroha-astrology/shared';

export const REGION_OPTIONS: { value: RegionId; label: string }[] = [
  { value: 'north', label: 'North' },
  { value: 'south', label: 'South' },
  { value: 'west', label: 'West' },
  { value: 'east', label: 'East' },
];

// Client-side metadata so the header detail line can render meaningful info
// (calendar name, region-specific Adhik Maas label) even when the server
// payload doesn't yet carry regionalMonths (e.g., stale panchang_cache rows
// from before the regional feature shipped).
export interface RegionMeta {
  id: RegionId;
  label: string;
  calendarName: string;     // 'Vikram Samvat', 'Bengali San', ...
  adhikMaasName: string;    // localised Adhik Maas / Mol Maas name
}

export const REGION_META: Record<RegionId, RegionMeta> = {
  north: { id: 'north', label: 'North', calendarName: 'Vikram Samvat',     adhikMaasName: 'Adhik Maas' },
  south: { id: 'south', label: 'South', calendarName: 'Shalivahana Shaka', adhikMaasName: 'Adhika Masam' },
  west:  { id: 'west',  label: 'West',  calendarName: 'Shalivahana Shaka', adhikMaasName: 'Adhik Maas' },
  east:  { id: 'east',  label: 'East',  calendarName: 'Bengali San',       adhikMaasName: 'Mol Maas' },
};
