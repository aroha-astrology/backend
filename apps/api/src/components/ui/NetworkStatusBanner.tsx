'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function NetworkStatusBanner() {
  const [offline, setOffline] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    // Sync initial state (SSR renders as online)
    setOffline(!navigator.onLine);

    const handleOffline = () => {
      setOffline(true);
      setShowBackOnline(false);
    };

    const handleOnline = () => {
      setOffline(false);
      setShowBackOnline(true);
      setTimeout(() => setShowBackOnline(false), 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return (
    <>
      {/* Persistent offline bar */}
      <AnimatePresence>
        {offline && (
          <motion.div
            key="offline-bar"
            initial={{ y: -48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="fixed top-0 inset-x-0 z-[10000] flex items-center justify-center gap-2 px-4 py-2.5 text-[12px] font-semibold"
            style={{
              background: 'rgba(239,68,68,0.92)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 12px rgba(239,68,68,0.35)',
              paddingTop: 'max(10px, calc(env(safe-area-inset-top) + 2px))',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
              <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
              <circle cx="12" cy="20" r="1" fill="white"/>
            </svg>
            <span style={{ color: 'white' }}>No internet connection</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Brief "Back online" toast */}
      <AnimatePresence>
        {showBackOnline && (
          <motion.div
            key="back-online"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap"
            style={{
              background: 'rgba(74,222,128,0.15)',
              border: '1px solid rgba(74,222,128,0.45)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 0 16px rgba(74,222,128,0.20)',
              color: '#4ade80',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
            </svg>
            Back online
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
