'use client';

import { useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { modalOverlay, modalContent } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
  footer?: ReactNode;
}

export function Modal({ isOpen, onClose, children, className, title, footer }: ModalProps) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom)+88px)] sm:pb-4">
          <motion.div
            className="absolute inset-0 bg-[rgba(7,8,14,0.65)] backdrop-blur-md"
            variants={modalOverlay}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            className={cn(
              'relative z-10 w-full max-w-lg rounded-[16px] bg-[var(--glass-3-bg)] backdrop-blur-[14px] border border-border-strong',
              'shadow-[0_24px_60px_rgba(0,0,0,0.6),0_0_32px_rgba(212,175,55,0.18)]',
              'flex flex-col max-h-[85svh] sm:max-h-[90vh]',
              className,
            )}
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {title && (
              <div className="flex-none px-6 pt-6 pb-4 flex items-center justify-between">
                <h2 className="j-display text-base text-text">{title}</h2>
                <button
                  onClick={onClose}
                  className="rounded-full p-1.5 text-text-muted hover:bg-surface-3 hover:text-accent transition-colors"
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
            )}
            <div className={cn('flex-1 min-h-0 overflow-y-auto', title ? 'px-6' : 'px-6 pt-6', footer ? 'pb-3' : 'pb-6')}>
              {children}
            </div>
            {footer && (
              <div className="flex-none px-6 py-3 border-t border-border bg-[var(--glass-3-bg)] rounded-b-[16px]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
