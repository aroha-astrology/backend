'use client';

import { motion } from 'framer-motion';
import type { CardElement, Orientation } from '@/lib/tarot/deck';

export interface TarotCard2DCard {
  name: string;
  number: string;
  position: string;
  orientation: Orientation;
  vedic: { element: CardElement };
}

interface TarotCard2DProps {
  card: TarotCard2DCard;
  isHighlighted?: boolean;
}

/**
 * Pure-CSS / SVG fallback for low-end devices or prefers-reduced-motion.
 * Matches the Vedic Night palette and produces the same information density
 * as the 3D card so layouts don't shift between paths.
 */
export function TarotCard2D({ card, isHighlighted = false }: TarotCard2DProps) {
  const reversed = card.orientation === 'Reversed';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="j-card"
      style={{
        position: 'relative',
        padding: '0.9rem 0.7rem 0.7rem',
        textAlign: 'center',
        aspectRatio: '12 / 18.5',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: isHighlighted
          ? '0 0 28px rgba(242,202,80,0.55), 0 0 12px rgba(212,175,55,0.4)'
          : '0 0 15px rgba(212,175,55,0.18)',
        borderColor: isHighlighted ? '#F2CA50' : undefined,
      }}
    >
      {/* Top: number + position label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#D4AF37', letterSpacing: '0.08em' }}>
        <span style={{ fontWeight: 600 }}>{card.number}</span>
        <span style={{ opacity: 0.7 }}>{card.position}</span>
      </div>

      {/* Center: element glyph + name */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
        <div
          style={{
            transform: reversed ? 'rotate(180deg)' : undefined,
            transition: 'transform 0.4s',
          }}
        >
          <ElementGlyph element={card.vedic.element} />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-serif, serif)',
            color: '#F2CA50',
            fontSize: '0.95rem',
            lineHeight: 1.15,
          }}
        >
          {card.name}
        </div>
      </div>

      {/* Bottom: orientation pill */}
      <div style={{ fontSize: '0.65rem', color: '#D0C5AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {card.orientation}
      </div>
    </motion.div>
  );
}

function ElementGlyph({ element }: { element: CardElement }) {
  const stroke = '#D4AF37';
  const fill = '#F2CA50';
  const size = 46;
  switch (element) {
    case 'fire':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
          <polygon points="20,6 33,32 7,32" fill={fill} fillOpacity={0.25} stroke={stroke} strokeWidth={1.5} />
        </svg>
      );
    case 'water':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
          <polygon points="20,34 33,8 7,8" fill={fill} fillOpacity={0.2} stroke={stroke} strokeWidth={1.5} />
        </svg>
      );
    case 'air':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
          <polygon points="20,6 33,32 7,32" fill={fill} fillOpacity={0.18} stroke={stroke} strokeWidth={1.5} />
          <line x1="10" y1="22" x2="30" y2="22" stroke={stroke} strokeWidth={1.5} />
        </svg>
      );
    case 'earth':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
          <polygon points="20,34 33,8 7,8" fill={fill} fillOpacity={0.18} stroke={stroke} strokeWidth={1.5} />
          <line x1="10" y1="18" x2="30" y2="18" stroke={stroke} strokeWidth={1.5} />
        </svg>
      );
    case 'spirit':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
          <circle cx="20" cy="20" r="13" fill="none" stroke={stroke} strokeWidth={1.5} />
          <circle cx="20" cy="20" r="3" fill={fill} />
        </svg>
      );
  }
}
