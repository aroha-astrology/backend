'use client';

import { useEffect } from 'react';

function postNotify(payload: Record<string, string>) {
  fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export function GlobalErrorListener() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      postNotify({
        type: 'frontend',
        message: `${e.message} (${e.filename ?? ''}:${e.lineno ?? ''})`,
        url: window.location.href,
      });
    };

    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { name?: string; message?: string } | null | undefined;
      const msg = String(reason?.message ?? reason ?? '');

      // Benign: Supabase auth-js uses navigator.locks for cross-tab token
      // refresh; when one tab re-acquires the lock with { steal: true }, the
      // previous holder's promise rejects with this AbortError. SDK already
      // moved on. Tracked at supabase/auth-js#762.
      if (
        reason?.name === 'AbortError' &&
        msg.includes("Lock broken by another request with the 'steal' option")
      ) {
        return;
      }

      postNotify({
        type: 'frontend',
        message: `Unhandled rejection: ${msg}`,
        url: window.location.href,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
