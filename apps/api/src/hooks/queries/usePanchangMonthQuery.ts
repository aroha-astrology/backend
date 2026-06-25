import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export interface PanchangMonthDay {
  date: string;
  day: number;
  weekday: number;
  tithi: string;
  tithiName: string;
  tithiNumber: number;
  paksha: 'Shukla' | 'Krishna' | null;
  nakshatra: string;
  nakshatraName: string;
  vara: string;
  isFullMoon: boolean;
  isNewMoon: boolean;
  isEkadashi: boolean;
}

interface Options {
  lat?: number | null;
  lng?: number | null;
}

export function usePanchangMonthQuery(year: number, month: number, opts: Options = {}) {
  const { lat, lng } = opts;
  const locationSuffix = typeof lat === 'number' && typeof lng === 'number'
    ? `${lat.toFixed(2)},${lng.toFixed(2)}`
    : 'default';

  return useQuery({
    queryKey: [...queryKeys.panchangMonth(year, month), locationSuffix] as const,
    queryFn: async (): Promise<PanchangMonthDay[]> => {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (typeof lat === 'number' && typeof lng === 'number') {
        params.set('lat', String(lat));
        params.set('lng', String(lng));
      }
      const r = await fetch(`/api/panchang/month?${params.toString()}`);
      if (!r.ok) throw new Error('Failed to fetch monthly panchang');
      const json = await r.json();
      return (json.data ?? []) as PanchangMonthDay[];
    },
    staleTime: 60 * 60 * 1000,
  });
}
