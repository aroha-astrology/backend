'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { WisdomLoader } from './wisdom-loader';
import { Planet3DInline } from '@/components/3d/Planet3DInline';

const ZODIAC = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

interface Props {
  visible: boolean;
  type: 'kundli' | 'report';
  name?: string;
  onContinue: () => void;
}

export function GeneratingOverlay({ visible, type, name, onContinue }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 9999, background: 'rgba(17,19,26,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        >
          {/* Floating dust particles */}
          {Array.from({ length: 18 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full pointer-events-none"
              style={{
                width: i % 3 === 0 ? 2 : 1,
                height: i % 3 === 0 ? 2 : 1,
                background: i % 4 === 0 ? 'var(--primary)' : 'rgba(212, 175, 55,0.35)',
                left: `${4 + (i * 7.1) % 92}%`,
                top: `${4 + (i * 13.3) % 92}%`,
              }}
              animate={{ opacity: [0, 0.7, 0], y: [0, -(8 + (i % 6) * 3), 0] }}
              transition={{ duration: 2.2 + (i % 4) * 0.5, repeat: Infinity, delay: (i * 0.21) % 2.8 }}
            />
          ))}

          {/* Card */}
          <motion.div
            initial={{ scale: 0.86, y: 28 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.88, y: 24 }}
            transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-[316px] rounded-[32px] px-8 py-9 text-center overflow-hidden bg-surface border border-border"
            style={{ boxShadow: 'var(--shadow-lg)' }}
          >
            {/* Top shimmer */}
            <div
              className="absolute top-0 left-6 right-6 h-[1.5px]"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(212, 175, 55,0.60), transparent)' }}
            />
            {/* Radial bg glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(212, 175, 55,0.07) 0%, transparent 62%)' }}
            />

            {/* Zodiac wheel */}
            <div className="relative mx-auto mb-7" style={{ width: 132, height: 132 }}>
              {/* Outer dashed orbit */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border: '1px dashed rgba(212, 175, 55,0.25)' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
              />
              {/* Inner ring */}
              <motion.div
                className="absolute"
                style={{ inset: 12, borderRadius: '50%', border: '1px solid rgba(212, 175, 55,0.12)' }}
                animate={{ rotate: -360 }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              />

              {/* Orbiting zodiac symbols */}
              {ZODIAC.map((sym, i) => {
                const rad = (i * 30 - 90) * (Math.PI / 180);
                const r = 52;
                return (
                  <motion.span
                    key={sym}
                    className="absolute text-[11px] select-none"
                    style={{
                      left: `calc(50% + ${r * Math.cos(rad)}px - 7px)`,
                      top: `calc(50% + ${r * Math.sin(rad)}px - 8px)`,
                      color: 'rgba(212, 175, 55,0.55)',
                    }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.9, repeat: Infinity, delay: i * 0.16 }}
                  >
                    {sym}
                  </motion.span>
                );
              })}

              {/* Center 3D planet (Guru/Jupiter reveals the kundli) */}
              <div className="absolute inset-0 flex items-center justify-center">
                <Planet3DInline planet={type === 'kundli' ? 'Jupiter' : 'Saturn'} size={64} />
              </div>
            </div>

            {/* Heading */}
            <p className="j-eyebrow mb-2">
              ✦ &nbsp;Yogi Baba
            </p>
            <h3 className="text-[16px] font-semibold text-text leading-snug mb-0.5">
              is handcrafting your
            </h3>
            <h3 className="j-display text-[22px] text-primary mb-1.5 leading-tight">
              {type === 'kundli' ? 'Kundli' : 'Report'}
            </h3>
            {name && (
              <p className="text-[12px] text-text-muted mb-5">
                for{' '}
                <span className="font-semibold text-text">{name}</span>
              </p>
            )}

            {/* Cycling wisdom text */}
            <div className="flex justify-center mb-6">
              <WisdomLoader section="kundli" size="sm" />
            </div>

            {/* CTA button */}
            <motion.button
              onClick={onContinue}
              className="w-full rounded-2xl py-3.5 text-[13px] font-bold border-none cursor-pointer mb-4 bg-primary text-white"
              style={{ boxShadow: '0 4px 16px rgba(212, 175, 55,0.30)' }}
              whileHover={{ scale: 1.02, boxShadow: '0 6px 24px rgba(212, 175, 55,0.45)' }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 340, damping: 22 }}
            >
              Continue exploring →
            </motion.button>

            <p className="text-[10px] leading-relaxed text-text-muted">
              We&apos;ll notify you the moment
              <br />
              your {type === 'kundli' ? 'cosmic blueprint' : 'report'} is ready
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
