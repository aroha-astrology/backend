'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Generic 5-tap unlock gate backed by localStorage.
 *
 *   const lock = useFeatureUnlock('mantra-jaap-unlocked');
 *   <button onClick={() => { if (lock.tap()) router.push(...); }}>
 *
 * `tap()` returns `true` only on the tap that flipped the state — callers
 * use that to perform the post-unlock action (navigate, open modal, etc).
 */
export function useFeatureUnlock(storageKey: string, tapsRequired = 5) {
  const [unlocked, setUnlocked] = useState(false);
  const [taps, setTaps] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(storageKey) === 'true') setUnlocked(true);
    } catch {
      // private mode etc — keep locked
    }
  }, [storageKey]);

  const tap = useCallback(() => {
    let didUnlock = false;
    setTaps((prev) => {
      const next = prev + 1;
      if (next >= tapsRequired) {
        try { window.localStorage.setItem(storageKey, 'true'); } catch { /* ignore */ }
        setUnlocked(true);
        didUnlock = true;
        return 0;
      }
      return next;
    });
    return didUnlock;
  }, [storageKey, tapsRequired]);

  return { unlocked, taps, tapsRequired, tap };
}
