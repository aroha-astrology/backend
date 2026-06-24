'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import type { AstrologerPersona } from '@/lib/astrologers';

interface ConfirmChatSheetProps {
  astrologer: AstrologerPersona;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmChatSheet({ astrologer, open, onClose, onConfirm }: ConfirmChatSheetProps) {
  const [privateMode, setPrivateMode] = useState(false);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(60,72,88,0.35)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-surface border-t border-border"
            style={{ maxHeight: '92vh', overflowY: 'auto' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div className="px-5 pb-8">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-[22px] font-extrabold text-text">Confirm Chat</h2>
                  <p className="text-[13px] text-text-muted mt-0.5">Review details and start your chat.</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer bg-surface-2 border border-border"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Astrologer card */}
              <div className="rounded-2xl overflow-hidden mb-4 border border-border bg-surface">
                <div className="flex gap-3 p-3">
                  {/* Photo */}
                  <div className="relative flex-shrink-0">
                    <div className="w-[80px] h-[90px] rounded-xl overflow-hidden border border-border">
                      <Image
                        src={astrologer.imagePath}
                        alt={astrologer.name}
                        width={80}
                        height={90}
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 text-center pb-1">
                      <p className="text-[8px] font-semibold text-primary">✦ Total chats</p>
                      <p className="text-[10px] font-extrabold text-primary">{astrologer.totalChats}</p>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[16px] font-extrabold text-text">{astrologer.name}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">AI</span>
                      </div>
                      <span className="flex-shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                        AI ASTRO
                      </span>
                    </div>

                    {/* Specialty chips */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {astrologer.tags.map(tag => (
                        <span
                          key={tag}
                          className="inline-block text-[11px] px-2.5 py-0.5 rounded-lg bg-surface-2 text-text-muted"
                        >{tag}</span>
                      ))}
                    </div>

                    {/* Style + title */}
                    <div className="space-y-0.5 mb-2">
                      <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
                        <span className="text-primary">⊕</span> {astrologer.style}
                      </p>
                      <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
                        <span className="text-primary">☆</span> {astrologer.title}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="flex items-baseline gap-2">
                      {astrologer.isFree ? (
                        <span className="text-[20px] font-extrabold text-success">FREE</span>
                      ) : (
                        <span className="text-[20px] font-extrabold text-success">{astrologer.priceLabel}</span>
                      )}
                      <span className="text-[13px] line-through text-text-muted">{astrologer.originalPriceLabel}</span>
                    </div>
                  </div>
                </div>

                {/* Daily Free pill */}
                <div className="flex items-center justify-center gap-1.5 py-2 bg-primary">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                  <span className="text-[12px] font-bold text-white">Daily Free: {astrologer.dailyFreeMinutes} min</span>
                </div>
              </div>

              {/* Body copy */}
              <p className="text-[13px] text-text-muted text-center mb-5 leading-relaxed">
                Tap Chat to confirm your order with <span className="font-semibold text-text">{astrologer.name}</span>.
                Your request will be sent immediately.
              </p>

              {/* Chat button */}
              <motion.button
                onClick={onConfirm}
                className="w-full py-4 rounded-2xl text-[17px] font-extrabold flex items-center justify-center gap-2 cursor-pointer border-none mb-4 bg-success text-white"
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.01 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Chat
              </motion.button>

              {/* Private mode toggle */}
              <div className="flex items-center justify-between py-3 border-t border-border">
                <div className="flex items-center gap-2 text-[13px] text-text-muted">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    <line x1="2" y1="2" x2="22" y2="22"/>
                  </svg>
                  Start chat in private mode.{' '}
                  <button className="text-primary underline cursor-pointer bg-transparent border-none p-0 text-[13px]">
                    Learn More
                  </button>
                </div>
                <button
                  onClick={() => setPrivateMode(p => !p)}
                  className="relative w-11 h-6 rounded-full cursor-pointer border-none transition-colors"
                  style={{ background: privateMode ? 'var(--primary)' : 'var(--surface-3)' }}
                >
                  <motion.div
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow"
                    animate={{ left: privateMode ? '22px' : '2px' }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                  />
                </button>
              </div>

              {/* Trust footer */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-success">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <p className="text-[11px] text-text-muted">
                  Every astrologer passes ID and face-match checks, test readings, and ongoing quality audits.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
