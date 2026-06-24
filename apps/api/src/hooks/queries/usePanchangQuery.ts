import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

interface Options {
  lat?: number | null;
  lng?: number | null;
  enabled?: boolean;
}

export function usePanchangQuery(date?: string, opts: Options = {}) {
  const { lat, lng, enabled = true } = opts;
  // Distinct cache keys per location so default-vs-user-location calls don't collide.
  const locationSuffix = typeof lat === 'number' && typeof lng === 'number'
    ? `${lat.toFixed(2)},${lng.toFixed(2)}`
    : 'default';
  const baseKey = date ? queryKeys.panchang(date) : queryKeys.panchangToday();
  const key = [...baseKey, locationSuffix] as const;
  const apiDate = date ?? new Date().toISOString().split('T')[0];

  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (typeof lat === 'number' && typeof lng === 'number') {
        params.set('lat', String(lat));
        params.set('lng', String(lng));
      }
      const qs = params.toString();
      const url = qs ? `/api/panchang/today?${qs}` : '/api/panchang/today';
      const r = await fetch(url);
      if (!r.ok) throw new Error('Failed to fetch panchang');
      const json = await r.json();
      return json.data ?? null;
    },
    enabled,
    staleTime: 60 * 60 * 1000,
    meta: { date: apiDate, locationSuffix },
  });
}
