'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

/**
 * Celestial Armillary Sphere — SVG orbital rings with constellation dots.
 * Renders as a decorative background element with subtle mouse parallax.
 */
export function CelestialSphere({ className = '' }: { className?: string }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 25, damping: 20 });
  const sy = useSpring(my, { stiffness: 25, damping: 20 });

  const rotateX = useTransform(sy, (v) => v * 8);
  const rotateY = useTransform(sx, (v) => v * 8);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [mx, my]);

  // Generate constellation dots along rings
  const ringDots = (count: number, rx: number, ry: number, rotateZ: number) => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const x = 200 + Math.cos(angle) * rx;
      const y = 200 + Math.sin(angle) * ry;
      const size = Math.random() > 0.7 ? 2 : 1;
      return { x, y, size, delay: i * 0.3 };
    });
  };

  const ring1Dots = ringDots(24, 160, 160, 0);
  const ring2Dots = ringDots(18, 140, 80, 25);
  const ring3Dots = ringDots(16, 80, 150, -15);

  return (
    <motion.div
      className={`pointer-events-none ${className}`}
      style={{
        rotateX,
        rotateY,
        perspective: 800,
        transformStyle: 'preserve-3d',
      }}
    >
      <svg
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        style={{ filter: 'drop-shadow(0 0 20px rgba(212,168,67,0.08))' }}
      >
        {/* Ring 1 — main equatorial ring */}
        <motion.ellipse
          cx="200" cy="200" rx="160" ry="160"
          stroke="rgba(212,168,67,0.14)"
          strokeWidth="0.5"
          fill="none"
          animate={{ rotate: 360 }}
          transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '200px 200px' }}
        />

        {/* Ring 2 — tilted ring */}
        <motion.ellipse
          cx="200" cy="200" rx="140" ry="80"
          stroke="rgba(103,232,249,0.10)"
          strokeWidth="0.5"
          fill="none"
          transform="rotate(25 200 200)"
          animate={{ rotate: -360 }}
          transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '200px 200px' }}
        />

        {/* Ring 3 — opposite tilt */}
        <motion.ellipse
          cx="200" cy="200" rx="80" ry="150"
          stroke="rgba(226,179,64,0.08)"
          strokeWidth="0.5"
          fill="none"
          transform="rotate(-15 200 200)"
          animate={{ rotate: 360 }}
          transition={{ duration: 150, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '200px 200px' }}
        />

        {/* Ring 4 — inner ring */}
        <ellipse
          cx="200" cy="200" rx="60" ry="60"
          stroke="rgba(212,168,67,0.08)"
          strokeWidth="0.5"
          strokeDasharray="3 6"
          fill="none"
        />

        {/* Center glow */}
        <circle cx="200" cy="200" r="3" fill="rgba(212,168,67,0.55)">
          <animate attributeName="r" values="2;4;2" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="200" cy="200" r="12" fill="none" stroke="rgba(212,168,67,0.07)" strokeWidth="0.5" />

        {/* Constellation dots on ring 1 */}
        {ring1Dots.map((dot, i) => (
          <circle
            key={`r1-${i}`}
            cx={dot.x}
            cy={dot.y}
            r={dot.size}
            fill="rgba(196,181,253,0.5)"
          >
            <animate
              attributeName="opacity"
              values="0.2;0.7;0.2"
              dur={`${2 + dot.delay % 3}s`}
              begin={`${dot.delay}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* Constellation dots on ring 2 */}
        {ring2Dots.map((dot, i) => (
          <circle
            key={`r2-${i}`}
            cx={dot.x}
            cy={dot.y}
            r={dot.size}
            fill="rgba(103,232,249,0.4)"
          >
            <animate
              attributeName="opacity"
              values="0.15;0.55;0.15"
              dur={`${2.5 + dot.delay % 2}s`}
              begin={`${dot.delay}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* Constellation dots on ring 3 */}
        {ring3Dots.map((dot, i) => (
          <circle
            key={`r3-${i}`}
            cx={dot.x}
            cy={dot.y}
            r={dot.size}
            fill="rgba(226,179,64,0.35)"
          >
            <animate
              attributeName="opacity"
              values="0.1;0.5;0.1"
              dur={`${3 + dot.delay % 2}s`}
              begin={`${dot.delay}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* Subtle connection lines between some dots */}
        {ring1Dots.slice(0, 8).map((dot, i) => {
          const next = ring1Dots[(i + 3) % ring1Dots.length];
          return (
            <line
              key={`line-${i}`}
              x1={dot.x} y1={dot.y}
              x2={next.x} y2={next.y}
              stroke="rgba(212,168,67,0.05)"
              strokeWidth="0.5"
            />
          );
        })}
      </svg>
    </motion.div>
  );
}
