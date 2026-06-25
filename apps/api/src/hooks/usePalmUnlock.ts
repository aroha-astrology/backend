'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'palm-unlocked';
const TAPS_REQUIRED = 5;

export function usePalmUnlock() {
  const [unlocked, setUnlocked] = useState(false);
  const [taps, setTaps] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === 'true') setUnlocked(true);
    } catch { /* private mode etc — keep locked */ }
  }, []);

  const tap = useCallback(() => {
    let didUnlock = false;
    setTaps((prev) => {
      const next = prev + 1;
      if (next >= TAPS_REQUIRED) {
        try { window.localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
        setUnlocked(true);
        didUnlock = true;
        return 0;
      }
      return next;
    });
    return didUnlock;
  }, []);

  return { unlocked, taps, tapsRequired: TAPS_REQUIRED, tap };
}
