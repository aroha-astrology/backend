'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { INDIAN_CITIES, type CityData } from '@aroha-astrology/shared';

const NAME_DEBOUNCE_MS = 350;
const MIN_NAME_CHARS = 3;
const MAX_CITY_MATCHES = 8;

export type PlaceResultsKind = 'pincode' | 'name' | 'cities' | 'empty';

export interface PlaceSearchState {
  cityQuery: string;
  setCityQuery: (v: string) => void;
  isPincode: boolean;
  cityMatches: CityData[];
  apiResults: CityData[];
  apiLoading: boolean;
  resultsKind: PlaceResultsKind;
}

export function usePlaceSearch(): PlaceSearchState {
  const [cityQuery, setCityQuery] = useState('');
  const [apiResults, setApiResults] = useState<CityData[]>([]);
  const [apiLoading, setApiLoading] = useState(false);

  const cacheRef = useRef<Map<string, CityData[]>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const trimmed = cityQuery.trim();
  const isPincode = /^\d{6}$/.test(trimmed);

  const cityMatches = useMemo<CityData[]>(() => {
    if (isPincode) return [];
    if (trimmed.length < 2) return [];
    const q = trimmed.toLowerCase();
    return INDIAN_CITIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q),
    ).slice(0, MAX_CITY_MATCHES);
  }, [trimmed, isPincode]);

  useEffect(() => {
    abortRef.current?.abort();

    if (isPincode) {
      const cacheKey = `p:${trimmed}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setApiResults(cached);
        setApiLoading(false);
        return;
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setApiLoading(true);
      fetch(`/api/location/pincode?pincode=${encodeURIComponent(trimmed)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data: { results?: CityData[] }) => {
          const results = data.results ?? [];
          cacheRef.current.set(cacheKey, results);
          setApiResults(results);
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setApiResults([]);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setApiLoading(false);
        });
      return;
    }

    if (trimmed.length < MIN_NAME_CHARS) {
      setApiResults([]);
      setApiLoading(false);
      return;
    }

    const cacheKey = `n:${trimmed.toLowerCase()}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setApiResults(cached);
      setApiLoading(false);
      return;
    }

    setApiLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => {
      fetch(`/api/location/pincode?name=${encodeURIComponent(trimmed)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data: { results?: CityData[] }) => {
          const results = data.results ?? [];
          cacheRef.current.set(cacheKey, results);
          setApiResults(results);
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setApiResults([]);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setApiLoading(false);
        });
    }, NAME_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [trimmed, isPincode]);

  const resultsKind: PlaceResultsKind = isPincode
    ? 'pincode'
    : apiResults.length > 0
      ? 'name'
      : cityMatches.length > 0
        ? 'cities'
        : 'empty';

  return {
    cityQuery,
    setCityQuery,
    isPincode,
    cityMatches,
    apiResults,
    apiLoading,
    resultsKind,
  };
}

export function dedupeApiAgainstCities(apiResults: CityData[], cityMatches: CityData[]): CityData[] {
  if (!cityMatches.length) return apiResults;
  const seen = new Set(cityMatches.map((c) => `${c.name.toLowerCase()}|${c.state.toLowerCase()}`));
  return apiResults.filter((r) => !seen.has(`${r.name.toLowerCase()}|${r.state.toLowerCase()}`));
}
