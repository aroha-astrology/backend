'use client';

import { useEffect, useState } from 'react';
import { useLowEndDevice } from '@/components/3d/useLowEndDevice';
import { Scene3DProvider } from '@/components/3d/Scene3DProvider';
import { TarotCardMesh } from './TarotCardMesh';
import { TarotCard2D } from './TarotCard2D';
import type { CardElement, Orientation } from '@/lib/tarot/deck';
import type { SpreadGeometry } from '@/lib/tarot/spreads';

export interface TarotSceneCard {
  id: string;
  name: string;
  number: string;
  position: string;
  orientation: Orientation;
  vedic: { element: CardElement };
}

interface TarotSceneProps {
  cards: TarotSceneCard[];
  geometry: SpreadGeometry;
  highlightedIndex?: number | null;
  height?: number;
}

export function TarotScene({ cards, geometry, highlightedIndex = null, height = 460 }: TarotSceneProps) {
  const low = useLowEndDevice();
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    // Small delay so the entry animation feels intentional.
    const t = setTimeout(() => setReveal(true), 250);
    return () => clearTimeout(t);
  }, [cards]);

  if (low) {
    return <TarotCard2DGrid cards={cards} geometry={geometry} highlightedIndex={highlightedIndex} />;
  }

  const positions = layoutFor(geometry, cards.length);

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <Scene3DProvider cameraPosition={cameraFor(geometry)}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} color="#F2CA50" />
        <pointLight position={[-4, -2, 3]} intensity={0.45} color="#D4AF37" />
        {cards.map((c, i) => {
          const pos = positions[i] ?? [0, 0, 0];
          return (
            <TarotCardMesh
              key={`${c.id}-${i}`}
              position={pos}
              element={c.vedic.element}
              orientation={c.orientation}
              isRevealed={reveal}
              isHighlighted={highlightedIndex === i}
              delaySeconds={0.4 + i * 0.18}
            />
          );
        })}
      </Scene3DProvider>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 2D fallback grid (prefers-reduced-motion / low-end devices)
// ────────────────────────────────────────────────────────────────────────────

function TarotCard2DGrid({
  cards,
  geometry,
  highlightedIndex,
}: {
  cards: TarotSceneCard[];
  geometry: SpreadGeometry;
  highlightedIndex: number | null;
}) {
  const cols = colsFor(geometry, cards.length);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: '0.75rem',
        padding: '0.5rem',
      }}
    >
      {cards.map((c, i) => (
        <TarotCard2D
          key={`${c.id}-${i}`}
          card={c}
          isHighlighted={highlightedIndex === i}
        />
      ))}
    </div>
  );
}

function colsFor(geometry: SpreadGeometry, count: number): number {
  switch (geometry) {
    case 'single': return 1;
    case 'row': return Math.min(count, 3);
    case 'pyramid': return 3;
    case 'arc': return Math.min(count, 4);
    case 'cross': return Math.min(count, 5);
    default: return Math.min(count, 4);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Spread geometry → 3D card positions
// Card size is 1.2 × 1.85 in world units.
// ────────────────────────────────────────────────────────────────────────────

function layoutFor(geometry: SpreadGeometry, count: number): Array<[number, number, number]> {
  switch (geometry) {
    case 'single':
      return [[0, 0, 0]];
    case 'row': {
      const spacing = 1.6;
      const start = -((count - 1) / 2) * spacing;
      return Array.from({ length: count }).map((_, i) => [start + i * spacing, 0, 0]);
    }
    case 'pyramid': {
      // 6 cards: bottom row of 2 (You, Other), middle row of 2 (Connection, Strength), top row of 2 (Challenge, Outcome)
      if (count === 6) {
        return [
          [-0.9, -2.1, 0],
          [0.9, -2.1, 0],
          [-0.9, 0, 0],
          [0.9, 0, 0],
          [-0.9, 2.1, 0],
          [0.9, 2.1, 0],
        ];
      }
      return defaultGrid(count);
    }
    case 'arc': {
      // 7 cards along a shallow upward arc
      const radius = 5.5;
      const span = Math.PI / 3.2; // ~56°
      return Array.from({ length: count }).map((_, i) => {
        const t = count === 1 ? 0 : i / (count - 1);
        const angle = -span / 2 + t * span;
        const x = Math.sin(angle) * radius;
        const y = Math.cos(angle) * radius - radius + 1.2;
        return [x, y, 0] as [number, number, number];
      });
    }
    case 'cross': {
      // Celtic Cross — 10 positions:
      // 0 Present (center), 1 Challenge (center, rotated 90°),
      // 2 Foundation (below), 3 Recent Past (left), 4 Best Outcome (above), 5 Near Future (right),
      // 6–9 staff: bottom-to-top column on the right
      // For simplicity we place the "challenge" card on top of the present and skip the 90° rotation in 3D.
      return [
        [0, 0, 0],     // 0 present
        [0, 0, 0.05],  // 1 challenge — slightly forward
        [0, -2.1, 0],  // 2 foundation
        [-1.7, 0, 0],  // 3 recent past
        [0, 2.1, 0],   // 4 best outcome
        [1.7, 0, 0],   // 5 near future
        [3.6, -2.4, 0],// 6 your attitude
        [3.6, -0.8, 0],// 7 external
        [3.6, 0.8, 0], // 8 hopes/fears
        [3.6, 2.4, 0], // 9 final outcome
      ];
    }
    default:
      return defaultGrid(count);
  }
}

function defaultGrid(count: number): Array<[number, number, number]> {
  const cols = Math.min(count, 4);
  const rows = Math.ceil(count / cols);
  const w = 1.55;
  const h = 2.1;
  return Array.from({ length: count }).map((_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = (c - (cols - 1) / 2) * w;
    const y = ((rows - 1) / 2 - r) * h;
    return [x, y, 0] as [number, number, number];
  });
}

function cameraFor(geometry: SpreadGeometry): [number, number, number] {
  switch (geometry) {
    case 'single': return [0, 0, 3.5];
    case 'row': return [0, 0, 4.5];
    case 'pyramid': return [0, 0, 7];
    case 'arc': return [0, 0, 6];
    case 'cross': return [1.5, 0, 9];
    default: return [0, 0, 6];
  }
}
