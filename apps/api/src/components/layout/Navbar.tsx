'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { PortalSwitcher } from '@/components/PortalSwitcher';
import { useCosmicSound } from '@/hooks/useCosmicSound';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/ui/icon';
import { TokenGlyph } from '@/components/ui/decorative';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function iconFor(type: string): string {
  if (type === 'kundli_ready') return '🪐';
  if (type === 'report_ready') return '⚡';
  if (type === 'system') return '✦';
  return '🔔';
}

export function Navbar() {
  const user = useStore((s) => s.user);
  const credits = useStore((s) => s.credits);
  const setCredits = useStore((s) => s.setCredits);
  const avatarUrl = useStore((s) => s.avatarUrl);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetch('/api/credits/balance')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (cancelled) return;
          if (data?.success && typeof data.data?.credits === 'number') {
            setCredits(data.data.credits);
          }
        })
        .catch(() => {});
    };
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); };
  }, [setCredits]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [popupNotif, setPopupNotif] = useState<Notification | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const { playNotificationSound } = useCosmicSound();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/notifications');
        if (!res.ok) return;
        const json = await res.json() as { data: Notification[]; unreadCount: number };
        if (cancelled) return;
        setNotifications(json.data);
        setUnreadCount(json.unreadCount);
        json.data.forEach(n => seenIdsRef.current.add(n.id));
      } catch { /* silent */ }
    };
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        const n = payload.new as Notification;
        if (seenIdsRef.current.has(n.id)) return;
        seenIdsRef.current.add(n.id);
        setNotifications(prev => [n, ...prev].slice(0, 30));
        if (!n.read_at) setUnreadCount(c => c + 1);
        if (n.type !== 'report_ready') setPopupNotif(n);
        playNotificationSound();
      })
      .subscribe();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, playNotificationSound]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) setNotificationOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenBell = async () => {
    const next = !notificationOpen;
    setNotificationOpen(next);
    if (next && unreadCount > 0) {
      setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
      setUnreadCount(0);
      try { await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' } }); } catch { /* retry next open */ }
    }
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    try { await fetch('/api/auth/signout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.href = '/';
  };

  const initial = user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U';
  const displayName = user?.name ? user.name.split(' ')[0] : 'User';

  const menuItems = [
    { href: '/profile', icon: 'user' as const, label: 'Profile' },
    { href: '/settings', icon: 'settings' as const, label: 'Settings' },
    { href: '/referral', icon: 'heart' as const, label: 'Refer & Earn' },
    { href: '/credits', icon: 'coin' as const, label: 'Buy Dhanam' },
    ...(user?.is_admin ? [{ href: '/admin', icon: 'star' as const, label: 'Admin Panel' }] : []),
  ];

  return (
    <nav
      className="sticky top-0 z-50 backdrop-blur-xl border-b border-border"
      style={{ background: 'var(--nav-glass)', paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex h-16 items-center justify-between px-4 md:px-6 max-w-screen-xl">

        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 no-underline" data-no-translate>
          <Image src="/logo.png" alt="Aroha Astrology" width={32} height={32} className="rounded-lg object-cover" />
          <span className="j-display j-text-gold text-[15px] hidden sm:block tracking-[0.18em] font-bold" data-no-translate>
            AROHA ASTROLOGY
          </span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-1">
          <LanguageSwitcher />

          {/* Home link (desktop) */}
          <Link
            href="/dashboard"
            className="hidden md:flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-surface-3 hover:text-text transition-colors"
            aria-label="Dashboard"
          >
            <Icon name="home" size={16} />
          </Link>

          {/* Notification bell */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={handleOpenBell}
              className="relative flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-surface-3"
              style={{ color: unreadCount > 0 ? 'var(--primary)' : 'var(--text-muted)' }}
              aria-label="Notifications"
            >
              <Icon name="bell" size={16} />
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.span>
              )}
            </button>

            <AnimatePresence>
              {notificationOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="fixed left-2 right-2 top-[calc(env(safe-area-inset-top)+3.5rem)] w-auto sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:w-80 rounded-[14px] border border-border-strong shadow-[0_18px_40px_rgba(0,0,0,0.55),0_0_24px_rgba(212,175,55,0.18)] overflow-hidden z-50"
                  style={{ transformOrigin: 'top right', background: 'var(--surface-2)' }}
                >
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                    <p className="j-eyebrow text-[10px]">Notifications</p>
                    {notifications.length > 0 && (
                      <button
                        onClick={async () => {
                          setNotifications([]);
                          setUnreadCount(0);
                          try { await fetch('/api/notifications', { method: 'DELETE' }); } catch { /* ignore */ }
                        }}
                        className="text-[10px] font-semibold text-text-muted hover:text-text cursor-pointer border-none bg-transparent"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-2xl mb-1">🔔</p>
                      <p className="text-xs text-text-muted">No notifications yet</p>
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.map((n) => {
                        const isUnread = !n.read_at;
                        const content = (
                          <div className={`flex items-start gap-3 px-3 py-2.5 border-b border-border transition-colors ${isUnread ? 'bg-primary/[0.04]' : ''}`}>
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                              <span className="text-sm">{iconFor(n.type)}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold truncate text-text">{n.title}</p>
                              {n.body && <p className="text-[10px] mt-0.5 line-clamp-2 text-text-muted">{n.body}</p>}
                              <p className="text-[9px] mt-1 text-text-muted/60">{timeAgo(n.created_at)}</p>
                            </div>
                            {isUnread && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />}
                          </div>
                        );
                        return n.link ? (
                          <Link key={n.id} href={n.link} onClick={() => setNotificationOpen(false)} className="block no-underline hover:bg-surface-3">
                            {content}
                          </Link>
                        ) : (
                          <div key={n.id}>{content}</div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Credits pill */}
          <Link
            href="/credits"
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold no-underline bg-primary/10 border border-primary/20 text-primary hover:bg-primary/15 transition-colors"
          >
            <TokenGlyph size={10} />
            {credits}
          </Link>

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Portal switcher — only visible when user has multiple roles */}
          <PortalSwitcher />

          {/* Avatar dropdown */}
          <div className="relative ml-0.5" ref={dropdownRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex h-8 items-center gap-1.5 px-2 rounded-full text-[11px] font-semibold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/15 transition-all cursor-pointer"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold shrink-0">
                  {initial}
                </div>
              )}
              <span className="hidden sm:inline max-w-24 truncate">{displayName}</span>
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute right-0 top-10 w-52 rounded-[14px] p-1.5 border border-border-strong shadow-[0_18px_40px_rgba(0,0,0,0.55),0_0_24px_rgba(212,175,55,0.18)]"
                  style={{ transformOrigin: 'top right', background: 'var(--surface-2)' }}
                >
                  <div className="mb-1 rounded-lg px-2.5 py-2 border-b border-border">
                    <div className="flex items-center gap-2 mb-1.5">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold shrink-0 text-primary">
                          {initial}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold truncate text-text">{user?.name || 'User'}</p>
                        <p className="text-[10px] truncate text-text-muted">{user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-primary">
                      <TokenGlyph size={9} />
                      {credits} Dhanam
                    </div>
                  </div>

                  {menuItems.map((item, i) => (
                    <motion.div key={item.href} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                      <Link
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-text hover:bg-surface-3 transition-colors no-underline"
                      >
                        <Icon name={item.icon} size={14} className="text-text-muted" />
                        {item.label}
                      </Link>
                    </motion.div>
                  ))}

                  <div className="my-1 h-px bg-border" />

                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-danger hover:bg-danger/8 transition-colors cursor-pointer border-none bg-transparent"
                  >
                    <Icon name="x" size={14} />
                    Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Notification popup */}
      <AnimatePresence>
        {popupNotif && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}
            onClick={() => setPopupNotif(null)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 40 }}
              transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-[360px] mx-4 mb-8 sm:mb-0 rounded-[16px] p-6 border border-border-strong shadow-[0_24px_60px_rgba(0,0,0,0.65),0_0_32px_rgba(212,175,55,0.25)] overflow-hidden"
              style={{ background: 'var(--surface-2)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setPopupNotif(null)}
                className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-surface-3 transition-colors border-none bg-transparent cursor-pointer"
              >
                <Icon name="x" size={14} />
              </button>

              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-primary/10 border border-primary/20">
                  <span className="text-2xl">{iconFor(popupNotif.type)}</span>
                </div>
              </div>

              <div className="text-center mb-5">
                <p className="j-eyebrow text-[10px] mb-2">Cosmic Bell Rang</p>
                <h3 className="j-display text-[17px] text-text mb-1">{popupNotif.title}</h3>
                {popupNotif.body && (
                  <p className="text-[12px] text-text-muted leading-relaxed">{popupNotif.body}</p>
                )}
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setPopupNotif(null)}
                  className="flex-1 rounded-full py-2.5 text-[12px] font-semibold cursor-pointer bg-surface-2 text-text-muted hover:text-text border border-border transition-colors"
                >
                  Later
                </button>
                {popupNotif.link ? (
                  <Link
                    href={popupNotif.link}
                    onClick={() => setPopupNotif(null)}
                    className="flex-1 rounded-full py-2.5 text-[12px] font-bold text-center no-underline bg-primary text-white hover:bg-primary-ink transition-colors"
                  >
                    Open now →
                  </Link>
                ) : (
                  <button
                    onClick={() => setPopupNotif(null)}
                    className="flex-1 rounded-full py-2.5 text-[12px] font-bold cursor-pointer border-none bg-[linear-gradient(135deg,#D4AF37,#B8893F)] shadow-[0_0_14px_rgba(212,175,55,0.45)] hover:shadow-[0_0_22px_rgba(242,202,80,0.60)] transition-shadow"
                    style={{ color: 'var(--bg)' }}
                  >
                    Got it
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
