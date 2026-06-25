'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { getAstrologer } from '@/lib/astrologers';
import { ConfirmChatSheet } from '@/components/chat/ConfirmChatSheet';

type ProfileTab = 'profile' | 'gallery' | 'chart';

export default function AstrologerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const astrologer = getAstrologer(id);

  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!astrologer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-text-muted">Astrologer not found.</p>
      </div>
    );
  }

  function handleConfirm() {
    setSheetOpen(false);
    router.push(`/chat?astrologer=${astrologer!.id}`);
  }

  const tabs: { key: ProfileTab; icon: React.ReactNode; label: string }[] = [
    {
      key: 'profile',
      label: 'Profile',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
    {
      key: 'gallery',
      label: 'Gallery',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      ),
    },
    {
      key: 'chart',
      label: 'Chart',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <ellipse cx="12" cy="12" rx="10" ry="10" />
          <line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /><line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-bg" style={{ paddingBottom: '148px' }}>

      {/* Hero */}
      <div className="relative w-full" style={{ height: '300px' }}>
        <Image
          src={astrologer.imagePath}
          alt={astrologer.name}
          fill
          className="object-cover object-top"
          priority
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(17,19,26,0.55) 0%, rgba(17,19,26,0.20) 45%, rgba(17,19,26,0.85) 80%, #11131A 100%)',
          }}
        />

        {/* Back */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
          style={{
            background: 'var(--card-bg)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--border-strong)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Share */}
        <button
          className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
          style={{
            background: 'var(--card-bg)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--border-strong)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="px-4 pt-3 relative z-[1]">

        {/* Name */}
        <div className="flex items-center gap-2 mb-2">
          <h1 className="j-display text-[26px] font-bold flex-shrink-0 text-text">{astrologer.name}</h1>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-primary-soft text-primary-ink">AI</span>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-4 text-text-2">
          {[
            { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, text: astrologer.availability },
            { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, text: `${astrologer.totalChats} chats` },
            { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>, text: astrologer.style },
            { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, text: astrologer.title },
          ].map((item, i) => (
            <span key={i} className="flex items-center gap-1 text-[12px]">
              <span className="text-text-muted">{item.icon}</span>
              {item.text}
              {i < 3 && <span className="ml-1 text-text-dim">|</span>}
            </span>
          ))}
        </div>

        {/* Tagline */}
        <div className="j-card px-4 py-3 mb-4">
          <p className="text-[13px] leading-relaxed text-text-2">{astrologer.tagline}</p>
        </div>

        {/* Tabs */}
        <div
          className="flex items-center mb-5 rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-2)', padding: 3, gap: 3, border: '1px solid var(--border)' }}
        >
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg cursor-pointer border-none transition-all text-[12px] font-semibold"
              style={{
                background: activeTab === tab.key ? 'var(--primary-soft)' : 'transparent',
                color: activeTab === tab.key ? 'var(--primary-ink)' : 'var(--text-dim)',
                boxShadow: activeTab === tab.key ? '0 0 12px var(--glow-soft)' : 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
              }}
            >
              {tab.icon}
            </button>
          ))}
        </div>

        {/* Profile tab content */}
        {activeTab === 'profile' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {/* About Me */}
            <section className="j-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
                <h3 className="j-eyebrow text-[10px] text-text-muted">About Me</h3>
              </div>
              <p className="text-[13px] leading-relaxed text-text-2">{astrologer.aboutMe}</p>
            </section>

            {/* Expertise */}
            <section className="j-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                <h3 className="j-eyebrow text-[10px] text-text-muted">Expertise</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {astrologer.expertise.map(e => (
                  <div
                    key={e}
                    className="flex flex-col items-center gap-1.5 px-5 py-3 rounded-2xl"
                    style={{
                      background: 'linear-gradient(135deg, rgba(212,175,55,0.10) 0%, rgba(242,202,80,0.18) 100%)',
                      border: '1.5px solid var(--border-gold)',
                    }}
                  >
                    <span className="text-[26px] leading-none j-text-gold">ॐ</span>
                    <span className="text-[12px] font-bold j-text-gold">{e}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* After Our Conversation */}
            <section className="j-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <h3 className="j-eyebrow text-[10px] text-text-muted">After Our Conversation</h3>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                      style={{
                        background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                        color: '#11131A',
                      }}
                    >
                      {astrologer.testimonial.author.charAt(0)}
                    </div>
                    <span className="text-[13px] font-semibold text-text">{astrologer.testimonial.author}</span>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--border-strong)">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
                  </svg>
                </div>
                <p className="text-[13px] italic leading-relaxed text-text-2">{astrologer.testimonial.quote}</p>
              </div>
            </section>

            {/* Trust footer */}
            <div className="flex items-center gap-2 py-2 pb-4">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--primary)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#11131A">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <p className="text-[11px] text-text-muted">
                Every astrologer passes ID and face-match checks, test readings, and ongoing quality audits.
              </p>
            </div>
          </motion.div>
        )}

        {(activeTab === 'gallery' || activeTab === 'chart') && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-text-muted"
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-40">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-[14px] font-semibold">Coming soon</p>
          </motion.div>
        )}
      </div>

      {/* Sticky CTA — sits above floating pill bottom nav */}
      <div
        className="fixed left-0 right-0 px-4 py-3 flex items-center justify-between gap-4"
        style={{
          bottom: 'calc(max(16px, env(safe-area-inset-bottom)) + 70px)',
          background: 'rgba(17,19,26,0.92)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--border)',
          zIndex: 40,
        }}
      >
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{
                background: 'var(--primary-soft)',
                color: 'var(--primary-ink)',
                border: '1px solid var(--border-gold)',
              }}
            >
              100% OFF
            </span>
            <span className="text-[10px] font-semibold text-accent">⚡ Instant</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[20px] font-extrabold j-text-gold">
              {astrologer.isFree ? 'FREE' : astrologer.priceLabel}
            </span>
            <span className="text-[12px] line-through text-text-dim">{astrologer.originalPriceLabel}</span>
          </div>
        </div>

        <motion.button
          onClick={() => setSheetOpen(true)}
          className="j-btn j-btn-primary flex-1 max-w-xs justify-center text-[15px] font-extrabold whitespace-nowrap"
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.02 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Start Chat
        </motion.button>
      </div>

      <ConfirmChatSheet
        astrologer={astrologer}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
