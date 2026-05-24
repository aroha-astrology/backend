'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentLocation } from '@/lib/native';

export interface UserLocation {
  current_latitude: number | null;
  current_longitude: number | null;
  current_city: string | null;
  current_country: string | null;
  location_source: 'device' | 'manual' | 'ip' | null;
  location_updated_at: string | null;
}

const QUERY_KEY = ['user', 'location'] as const;

export function useUserLocation() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<UserLocation | null> => {
      const r = await fetch('/api/user/location');
      if (!r.ok) throw new Error('Failed to load location');
      const json = await r.json();
      return (json.data ?? null) as UserLocation | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Trigger a fresh device-permission prompt and persist the result.
  // Returns the new location or null if the user denied/the browser failed.
  const refresh = useCallback(async (): Promise<UserLocation | null> => {
    const loc = await getCurrentLocation();
    if (!loc) return null;
    const res = await fetch('/api/user/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: loc.lat, longitude: loc.lng, source: 'device' }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const next: UserLocation = {
      current_latitude: loc.lat,
      current_longitude: loc.lng,
      current_city: json.data?.city ?? null,
      current_country: json.data?.country ?? null,
      location_source: 'device',
      location_updated_at: json.data?.location_updated_at ?? new Date().toISOString(),
    };
    qc.setQueryData(QUERY_KEY, next);
    return next;
  }, [qc]);

  const lat = query.data?.current_latitude ?? null;
  const lng = query.data?.current_longitude ?? null;
  const hasLocation = typeof lat === 'number' && typeof lng === 'number';

  return {
    location: query.data ?? null,
    lat,
    lng,
    hasLocation,
    isLoading: query.isLoading,
    refresh,
  };
}
