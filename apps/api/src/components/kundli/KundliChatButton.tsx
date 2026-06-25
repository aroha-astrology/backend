'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ASTROLOGERS } from '@/lib/astrologers';

interface ChatSession {
  id: string;
  title: string;
  message_count: number;
  last_message_at: string;
}

function timeAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function guessAstrologer(title: string) {
  const t = title.toLowerCase();
  return ASTROLOGERS.find(a => t.includes(a.shortName.toLowerCase())) ?? ASTROLOGERS[0];
}

interface Props {
  chartId: string;
}

export function KundliChatButton({ chartId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/chat/sessions')
      .then(r => r.ok ? r.json() : null)
      .then(res => { if (res?.data) setSessions(res.data); })
      .finally(() => setLoading(false));
  }, [open]);

  const continueSession = (sessionId: string) => {
    setOpen(false);
    router.push(`/chat?session=${sessionId}&chartId=${chartId}`);
  };

  const newChat = () => {
    setOpen(false);
    router.push(`/chat?chartId=${chartId}`);
  };

  return (
    <>
      {/* Floating chat button */}
      <motion.button
        onClick={() => setOpen(true)}
        className="fixed bottom-[84px] right-4 z-40 w-13 h-13 rounded-full shadow-2xl flex items-center justify-center cursor-pointer border-none"
        style={{
          width: 52,
          height: 52,
          background: 'var(--primary)',
          boxShadow: '0 4px 20px rgba(212, 175, 55,0.40)',
        }}
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.06 }}
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        aria-label="Chat with astrologer"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </motion.button>

      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col"
            style={{
              background: 'var(--surface)',
              borderTop: '1px solid var(--border)',
              maxHeight: '80vh',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(0,0,0,0.12)' }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 className="text-[16px] font-extrabold text-text font-[family-name:var(--font-serif)]">Chat History</h2>
                <p className="text-[11px] text-text-secondary mt-0.5">Continue a past reading or start fresh</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-text-secondary text-lg bg-transparent border-none cursor-pointer"
                style={{ background: 'rgba(0,0,0,0.06)' }}
              >×</button>
            </div>

            {/* New Chat CTA */}
            <div className="px-5 py-3">
              <motion.button
                onClick={newChat}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[14px] font-bold text-white border-none cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #1a5e1c, #2D8C30)' }}
                whileTap={{ scale: 0.97 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                Chat with Astrologer
              </motion.button>
            </div>

            {/* Sessions list */}
            <div className="flex-1 overflow-y-auto px-5 pb-8" style={{ scrollbarWidth: 'none' }}>
              {loading && (
                <div className="flex items-center justify-center py-10">
                  <div className="space-y-2 w-full px-2">
                    {[1,2,3].map(i => <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'rgba(0,0,0,0.06)' }} />)}
                  </div>
                </div>
              )}
              {!loading && sessions.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-3xl mb-3">🙏</p>
                  <p className="text-[13px] text-text-secondary">No past chats yet.</p>
                  <p className="text-[11px] text-text-secondary/60 mt-1">Start a new conversation above.</p>
                </div>
              )}
              {!loading && sessions.map(session => {
                const astro = guessAstrologer(session.title);
                return (
                  <motion.button
                    key={session.id}
                    onClick={() => continueSession(session.id)}
                    className="w-full flex items-center gap-3 py-3 text-left bg-transparent border-none cursor-pointer"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Avatar */}
                    <div
                      className="flex-shrink-0 w-[46px] h-[46px] rounded-full flex items-center justify-center text-[22px]"
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {astro.avatar}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[13px] font-bold text-text truncate">{astro.name}</span>
                        <span className="text-[10px] text-text-secondary/60 flex-shrink-0 ml-2">{timeAgo(session.last_message_at)}</span>
                      </div>
                      <p className="text-[12px] text-text-secondary truncate leading-snug">{session.title}</p>
                      <p className="text-[10px] text-text-secondary/50 mt-0.5">{session.message_count} message{session.message_count !== 1 ? 's' : ''}</p>
                    </div>

                    {/* Arrow */}
                    <svg className="flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
