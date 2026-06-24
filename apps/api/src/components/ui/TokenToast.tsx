'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { startPayment } from '@/lib/payments';

// ─── Types ──────────────────────────────────────────────────────────────────

type ToastType = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message: string;
  action?: { label: string; href: string };
}

interface TokenToastCtx {
  /** Called from API 402 responses — suppressed if user already dismissed once */
  showInsufficientTokens: () => void;
  /** Called from explicit paid-feature buttons — always shows, resets dismissed state */
  showInsufficientTokensForPaidFeature: () => void;
  showSuccess: (title: string, message: string) => void;
  showError: (message: string) => void;
}

// ─── Context ────────────────────────────────────────────────────────────────

const TokenToastContext = createContext<TokenToastCtx>({
  showInsufficientTokens: () => {},
  showInsufficientTokensForPaidFeature: () => {},
  showSuccess: () => {},
  showError: () => {},
});

export function useTokenToast() {
  return useContext(TokenToastContext);
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function TokenToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tokenModal, setTokenModal] = useState(false);
  const counter = useRef(0);
  // tracks whether user dismissed the insufficient-tokens modal this session
  const dismissedRef = useRef(false);

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { ...t, id }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 5000);
  }, []);

  const showInsufficientTokens = useCallback(() => {
    // Silently skip if the user already dismissed — don't nag on every API call
    if (dismissedRef.current) return;
    setTokenModal(true);
  }, []);

  const showInsufficientTokensForPaidFeature = useCallback(() => {
    // Explicit paid-feature click always shows and resets dismissed state
    dismissedRef.current = false;
    setTokenModal(true);
  }, []);

  const dismissTokenModal = useCallback(() => {
    dismissedRef.current = true;
    setTokenModal(false);
  }, []);

  const showSuccess = useCallback((title: string, message: string) => {
    addToast({ type: 'success', title, message });
  }, [addToast]);

  const showError = useCallback((message: string) => {
    addToast({ type: 'error', title: 'Error', message });
  }, [addToast]);

  return (
    <TokenToastContext.Provider value={{ showInsufficientTokens, showInsufficientTokensForPaidFeature, showSuccess, showError }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(x => x.id !== id))} />
      <InsufficientTokensModal open={tokenModal} onDismiss={dismissTokenModal} />
    </TokenToastContext.Provider>
  );
}

// ─── Toast UI ───────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const router = useRouter();

  const colors = {
    error: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)', icon: '#ef4444', title: '#fca5a5' },
    success: { bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.4)', icon: '#4ade80', title: '#86efac' },
    info: { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.4)', icon: '#a855f7', title: '#d8b4fe' },
  };
  const c = colors[toast.type];

  return (
    <motion.div
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="pointer-events-auto w-[300px] rounded-xl p-4"
      style={{ background: c.bg, border: `1px solid ${c.border}`, backdropFilter: 'blur(12px)' }}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="mt-0.5 flex-shrink-0">
          {toast.type === 'error' && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.icon} strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><circle cx="12" cy="16" r="0.5" fill={c.icon} />
            </svg>
          )}
          {toast.type === 'success' && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.icon} strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: c.title }}>{toast.title}</p>
          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{toast.message}</p>

          {toast.action && (
            <button
              onClick={() => {
                onDismiss();
                if (toast.action!.href === '/credits') {
                  startPayment('tokens');
                } else {
                  router.push(toast.action!.href);
                }
              }}
              className="mt-2 rounded-lg px-3 py-1 text-xs font-bold transition-opacity hover:opacity-80"
              style={{ background: 'var(--primary)', color: '#fff' }}
            >
              {toast.action.label}
            </button>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-text-secondary hover:text-text transition-colors"
          style={{ fontSize: '14px', lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}

// ─── Insufficient Tokens Modal ──────────────────────────────────────────────

function InsufficientTokensModal({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
            onClick={onDismiss}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-sm rounded-2xl p-6 relative"
              style={{
                background: 'rgba(15,10,30,0.95)',
                border: '1px solid rgba(245,158,11,0.35)',
                boxShadow: '0 0 40px rgba(245,158,11,0.12), 0 8px 32px rgba(0,0,0,0.6)',
                backdropFilter: 'blur(20px)',
              }}
            >
              {/* Dismiss button */}
              <button
                onClick={onDismiss}
                className="absolute top-3 right-3 text-text-secondary hover:text-text transition-colors p-1"
                aria-label="Dismiss"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="13" y2="13" />
                  <line x1="13" y1="1" x2="1" y2="13" />
                </svg>
              </button>

              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <circle cx="12" cy="16" r="0.5" fill="#F59E0B" />
                  </svg>
                </div>
              </div>

              {/* Text */}
              <h3 className="text-center text-lg font-bold text-text mb-2">Out of Dhanam</h3>
              <p className="text-center text-sm text-text-secondary leading-relaxed mb-6">
                You need more Dhanam to unlock this feature. Add Dhanam to continue your cosmic journey.
              </p>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    onDismiss();
                    startPayment('tokens');
                  }}
                  className="w-full rounded-xl py-3 text-sm font-bold transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#0f0a1e' }}
                >
                  Add Dhanam
                </button>
                <button
                  onClick={onDismiss}
                  className="w-full rounded-xl py-2.5 text-sm font-medium text-text-secondary hover:text-text transition-colors"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Utility: wrap fetch to auto-show toast on 402 ──────────────────────────

export async function fetchWithTokenCheck(
  url: string,
  options: RequestInit,
  showInsufficientTokens: () => void,
): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 402) {
    showInsufficientTokens();
  }
  return res;
}
