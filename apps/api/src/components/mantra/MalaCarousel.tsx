'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { RudrakshaBead } from './RudrakshaBead';
import { ease } from '@/lib/motion';

interface Props {
  count: number;
  jaapCount: number;
  mukhi: number;
  locked: boolean;
  isPlaying?: boolean;
  onTap: () => void;
}

const ACTIVE_SIZE = 140;
const SIDE_SIZE = 110;
const VERTICAL_GAP = 130;

/**
 * Vertical mala — 3 rudraksha beads stacked (top fading, active centre,
 * bottom fading). The active bead sits inside a gold marquise yantra and
 * has the count number overlaid. Sound-wave arcs on either side pulse
 * while the mantra audio is playing. Each tap shifts the strip one slot
 * up: the active bead exits upward, the bottom one becomes the new
 * active, a fresh bead enters from the bottom.
 *
 * Bead visual: <img src="/images/rudraksha.png"> with a photoreal SVG
 * fallback if the PNG hasn't been provided yet.
 */
export function MalaCarousel({
  count,
  jaapCount: _jaapCount,
  mukhi,
  locked,
  isPlaying,
  onTap,
}: Props) {
  const prefersReduced = useReducedMotion();

  const visibleBeads = useMemo(
    () => [
      { id: count - 1, offset: -1 },
      { id: count, offset: 0 },
      { id: count + 1, offset: 1 },
    ],
    [count],
  );

  const transition = prefersReduced
    ? { duration: 0 }
    : { duration: 0.45, ease: ease.spring as unknown as number[] };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 380,
        height: 380,
        margin: '0 auto',
        opacity: locked ? 0.65 : 1,
        transition: 'opacity 220ms ease-out',
      }}
    >
      {/* Gold yantra (marquise / 4-cusp shape) behind the active bead */}
      <Yantra />

      {/* Sound wave arcs on each side */}
      <SoundWaves side="left" playing={isPlaying} />
      <SoundWaves side="right" playing={isPlaying} />

      {/* Beads — vertical stack */}
      <AnimatePresence initial={false}>
        {visibleBeads.map((bead) => {
          const isActive = bead.offset === 0;
          const targetY = bead.offset * VERTICAL_GAP;
          const sz = isActive ? ACTIVE_SIZE : SIDE_SIZE;
          const op = isActive ? 1 : 0.85;
          return (
            <motion.div
              key={bead.id}
              initial={{ y: 2 * VERTICAL_GAP, opacity: 0, scale: 0.45 }}
              animate={{ y: targetY, opacity: op, scale: 1 }}
              exit={{ y: -2 * VERTICAL_GAP, opacity: 0, scale: 0.4, rotate: -20 }}
              transition={transition}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                marginLeft: -sz / 2,
                marginTop: -sz / 2,
                width: sz,
                height: sz,
                zIndex: isActive ? 4 : 3,
                pointerEvents: 'none',
                willChange: 'transform, opacity',
              }}
            >
              <BeadImage size={sz} mukhi={mukhi} />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Centre tap target — invisible button anchored at active bead position */}
      <button
        type="button"
        onClick={onTap}
        disabled={locked}
        aria-label="Tap the bead to count"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          marginLeft: -ACTIVE_SIZE / 2,
          marginTop: -ACTIVE_SIZE / 2,
          width: ACTIVE_SIZE,
          height: ACTIVE_SIZE,
          borderRadius: '50%',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: locked ? 'default' : 'pointer',
          zIndex: 5,
        }}
      />

      {/* Count number — over the active bead */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 6,
        }}
      >
        <p
          className="text-5xl font-bold font-[family-name:var(--font-serif)]"
          style={{
            color: '#3d1f0a',
            textShadow: '0 1px 1px rgba(255,235,180,0.4)',
          }}
        >
          {count}
        </p>
      </div>
    </div>
  );
}

function Yantra() {
  return (
    <svg
      viewBox="-1.05 -1.05 2.1 2.1"
      width={320}
      height={380}
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 6px 18px rgba(212,140,40,0.18))',
      }}
    >
      <defs>
        <linearGradient id="yantraGrad" x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0%" stopColor="#cf8e23" />
          <stop offset="40%" stopColor="#f3bb37" />
          <stop offset="60%" stopColor="#f3bb37" />
          <stop offset="100%" stopColor="#cf8e23" />
        </linearGradient>
        <radialGradient id="yantraGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,225,135,0.45)" />
          <stop offset="100%" stopColor="rgba(255,225,135,0)" />
        </radialGradient>
      </defs>
      {/* 4-cusp marquise shape: pointed at top/bottom/left/right with curved petals between */}
      <path
        d="
          M 0,-1
          C 0.18,-0.92 0.48,-0.35 0.92,0
          C 0.48,0.35 0.18,0.92 0,1
          C -0.18,0.92 -0.48,0.35 -0.92,0
          C -0.48,-0.35 -0.18,-0.92 0,-1
          Z
        "
        fill="url(#yantraGrad)"
      />
      <circle cx="0" cy="0" r="0.6" fill="url(#yantraGlow)" />
    </svg>
  );
}

function BeadImage({ size, mukhi }: { size: number; mukhi: number }) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    // PNG missing → fall back to the photoreal SVG bead
    return (
      <RudrakshaBead
        mukhi={mukhi}
        size={size}
        locked={false}
        onTap={() => {}}
        hideHalo
        hideShadow
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/rudraksha.png"
      alt=""
      width={size}
      height={size}
      onError={() => setErrored(true)}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        display: 'block',
        pointerEvents: 'none',
        filter: 'drop-shadow(0 4px 10px rgba(60,30,10,0.35))',
      }}
    />
  );
}

function SoundWaves({ side, playing }: { side: 'left' | 'right'; playing?: boolean }) {
  const isLeft = side === 'left';
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        ...(isLeft ? { left: '0%' } : { right: '0%' }),
        top: '50%',
        transform: 'translateY(-50%)',
        width: 110,
        height: 240,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 110 240" preserveAspectRatio="none">
        {[0, 1, 2, 3].map((i) => {
          const baseX = isLeft ? 95 - i * 20 : 15 + i * 20;
          const cpX = isLeft ? baseX - 28 : baseX + 28;
          const d = `M ${baseX},30 Q ${cpX},120 ${baseX},210`;
          return (
            <motion.path
              key={i}
              d={d}
              fill="none"
              stroke="#b08246"
              strokeWidth={1.6}
              strokeLinecap="round"
              animate={
                playing
                  ? { opacity: [0.18, 0.55, 0.18] }
                  : { opacity: 0.22 }
              }
              transition={
                playing
                  ? {
                      duration: 1.6,
                      ease: 'easeInOut',
                      repeat: Infinity,
                      delay: i * 0.18,
                    }
                  : { duration: 0.3 }
              }
            />
          );
        })}
      </svg>
    </div>
  );
}
