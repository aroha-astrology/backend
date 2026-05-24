'use client';

import { useEffect, useState } from 'react';

interface StreamingTextProps {
  text: string;
  speed?: number;
  cursor?: boolean;
  onDone?: () => void;
  className?: string;
}

export function StreamingText({
  text,
  speed = 35,
  cursor = true,
  onDone,
  className,
}: StreamingTextProps) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= text.length) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setShown((s) => s + 1), speed);
    return () => clearTimeout(t);
  }, [shown, text, speed, onDone]);

  useEffect(() => {
    setShown(0);
  }, [text]);

  return (
    <span className={className}>
      {text.slice(0, shown)}
      {cursor && shown < text.length && (
        <span
          style={{
            display: 'inline-block',
            width: 2,
            height: '1em',
            background: 'var(--primary)',
            verticalAlign: '-2px',
            marginLeft: 2,
            animation: 'j-cursor 1s steps(1) infinite',
          }}
        />
      )}
    </span>
  );
}
