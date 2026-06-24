'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/* ── Pill toggle (used in KundliDesktop, LifeJourney, etc.) ─────── */

interface PillTab {
  key: string;
  label: string;
}

interface PillTabsProps {
  tabs: PillTab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
  /** Override the framer-motion layoutId — required when more than one PillTabs renders on the same screen to keep their indicators from animating into each other. */
  layoutId?: string;
}

export function PillTabs({ tabs, active, onChange, className, layoutId = 'pillTabActive' }: PillTabsProps) {
  return (
    <div
      className={cn(
        'flex w-full items-center rounded-full p-1 bg-[var(--card-bg)] backdrop-blur-md border border-border',
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative flex-1 px-5 py-1.5 rounded-full text-[13px] font-medium cursor-pointer select-none',
              'transition-colors duration-150',
              isActive ? 'text-[#11131A] font-semibold' : 'text-text-muted hover:text-text',
            )}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,#D4AF37,#B8893F)] shadow-[0_0_14px_rgba(212,175,55,0.45)]"
                style={{ zIndex: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative" style={{ zIndex: 1 }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Underline tabs (Love | Career | Money | Health style) ──────── */

interface UnderlineTab {
  key: string;
  label: string;
  icon?: ReactNode;
}

interface UnderlineTabsProps {
  tabs: UnderlineTab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function UnderlineTabs({ tabs, active, onChange, className }: UnderlineTabsProps) {
  return (
    <div
      className={cn(
        'flex items-center overflow-x-auto scrollbar-none border-b border-border',
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium',
              'whitespace-nowrap shrink-0 cursor-pointer select-none border-none bg-transparent',
              'transition-colors duration-150',
              isActive ? 'text-accent font-semibold' : 'text-text-muted hover:text-text',
            )}
          >
            {tab.icon}
            {tab.label}
            {isActive && (
              <motion.div
                layoutId="underlineTabActive"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-[linear-gradient(90deg,transparent,#F2CA50,transparent)] rounded-t-sm shadow-[0_0_10px_rgba(242,202,80,0.6)]"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Tab Panel helper ────────────────────────────────────────────── */

interface TabPanelProps {
  activeKey: string;
  tabKey: string;
  children: ReactNode;
}

export function TabPanel({ activeKey, tabKey, children }: TabPanelProps) {
  if (activeKey !== tabKey) return null;
  return <>{children}</>;
}
