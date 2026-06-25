import React from 'react';

interface RichTextProps {
  children: string | undefined | null;
  className?: string;
  asBullets?: boolean;
}

// Common Vedic astrology terms and their plain-English meanings
const GLOSSARY: Record<string, string> = {
  'Guru Chandal Yoga': 'Jupiter-Rahu affliction',
  'Kaal Sarp Dosha': 'Rahu-Ketu axis affliction',
  'Neech Bhang Raj Yoga': 'debilitation cancellation',
  'Gajakesari Yoga': 'Moon-Jupiter prosperity',
  'Daridra Yoga': 'poverty combination',
  'Kemadruma Yoga': 'Moon isolation',
  'Mangal Dosha': 'Mars affliction',
  'Grahan Yoga': 'eclipse combination',
  'Raj Yoga': 'royal success combination',
  'Dhana Yoga': 'wealth combination',
  'Sade Sati': '7.5-year Saturn phase',
  'Yogakaraka': 'most benefic planet for lagna',
  'Parivartana': 'mutual sign exchange',
  'Atmakaraka': 'soul significator planet',
  'Mahadasha': 'major planetary period',
  'Antardasha': 'sub-period',
  'Vimshottari': '120-year cycle system',
  'Nakshatra': 'lunar mansion',
  'Ascendant': 'rising sign at birth',
  'Lagna': 'rising sign',
  'Trikona': 'trine houses (1,5,9)',
  'Kendra': 'angular houses (1,4,7,10)',
  'Dusthana': 'malefic houses (6,8,12)',
  'Upachaya': 'growth houses (3,6,10,11)',
  'Gochara': 'planetary transit',
  'Retrograde': 'planet moving backward',
  'Exalted': 'planet at peak strength',
  'Debilitated': 'planet at lowest strength',
  'Combust': 'planet eclipsed by Sun',
  'Dosha': 'planetary affliction',
};

// Precomputed regex — longer terms matched first to avoid partial matches
const GLOSS_RE = new RegExp(
  `\\b(${Object.keys(GLOSSARY)
    .sort((a, b) => b.length - a.length)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'gi'
);

function applyGlossary(text: string, startKey: number): React.JSX.Element {
  GLOSS_RE.lastIndex = 0;
  if (!GLOSS_RE.test(text)) return <>{text}</>;
  GLOSS_RE.lastIndex = 0;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = startKey;
  let match: RegExpExecArray | null;

  while ((match = GLOSS_RE.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const term = match[0];
    const meaning =
      GLOSSARY[term] ??
      GLOSSARY[
        Object.keys(GLOSSARY).find(k => k.toLowerCase() === term.toLowerCase()) ?? ''
      ];
    nodes.push(
      <span key={key++}>
        <span className="font-medium text-text">{term}</span>
        {meaning && (
          <span className="text-[10px] text-primary/60 italic ml-0.5">({meaning})</span>
        )}
      </span>
    );
    lastIndex = GLOSS_RE.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  GLOSS_RE.lastIndex = 0;
  return <>{nodes}</>;
}

export function parseInline(text: string, keyOffset = 0): React.JSX.Element {
  const nodes: React.ReactNode[] = [];
  const boldItalicRe = /\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g;
  let lastIndex = 0;
  let key = keyOffset;
  let match: RegExpExecArray | null;

  while ((match = boldItalicRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(applyGlossary(text.slice(lastIndex, match.index), key));
      key += 50;
    }
    if (match[1] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold text-text">
          {applyGlossary(match[1], key)}
        </strong>
      );
      key += 20;
    } else if (match[2] !== undefined) {
      nodes.push(<em key={key++} className="italic text-text-secondary">{match[2]}</em>);
    }
    lastIndex = boldItalicRe.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(applyGlossary(text.slice(lastIndex), key));
  }
  return <>{nodes}</>;
}

export function RichText({ children, className = '', asBullets = false }: RichTextProps) {
  if (!children) return null;

  const normalized = String(children)
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '  ')
    .replace(/\t/g, '  ')
    // Inject newlines before heading markers embedded inline (AI often omits newlines)
    .replace(/(?<!\n)(#{2,4} )/g, '\n$1')
    // Split *** separators that are inline
    .replace(/(?<!\n)(\*{3,})(?!\*)/g, '\n$1\n')
    // Clean up triple+ newlines
    .replace(/\n{3,}/g, '\n\n');

  const lines = normalized.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let key = 0;

  const flushList = () => {
    if (!listItems.length) return;
    if (listType === 'ol') {
      nodes.push(<ol key={key++} className="pl-1 space-y-1 mt-1">{listItems}</ol>);
    } else {
      nodes.push(<ul key={key++} className="pl-1 space-y-1 mt-1">{listItems}</ul>);
    }
    listItems = [];
    listType = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim()) && line.trim().length >= 3) {
      flushList();
      nodes.push(
        <div key={key++} className="h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent my-3" />
      );
      continue;
    }

    // h2
    if (line.startsWith('## ')) {
      flushList();
      nodes.push(
        <h2 key={key++} className="text-sm font-bold text-text mt-4 mb-2 first:mt-0 font-[family-name:var(--font-serif)] flex items-center gap-1.5">
          {parseInline(line.slice(3).trim(), key * 100)}
        </h2>
      );
      continue;
    }

    // h3
    if (line.startsWith('### ')) {
      flushList();
      nodes.push(
        <div key={key++} className="flex items-center gap-2 mt-3.5 mb-1.5 first:mt-0">
          <span className="text-accent text-[10px]">✦</span>
          <h3 className="text-[11px] font-semibold text-primary tracking-[0.18em] uppercase">
            {parseInline(line.slice(4).trim(), key * 100)}
          </h3>
          <span className="h-px flex-1 bg-gradient-to-r from-primary/25 to-transparent" />
        </div>
      );
      continue;
    }

    // h4
    if (line.startsWith('#### ')) {
      flushList();
      nodes.push(
        <h4 key={key++} className="text-xs font-semibold text-text mt-2.5 mb-0.5">
          {parseInline(line.slice(5).trim(), key * 100)}
        </h4>
      );
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[*\-+]\s+(.+)/);
    if (ulMatch) {
      if (listType === 'ol') flushList();
      listType = 'ul';
      listItems.push(
        <li key={key++} className="flex gap-2 text-xs leading-relaxed text-text-secondary">
          <span className="text-accent/70 mt-0.5 shrink-0 text-[10px]">◆</span>
          <span>{parseInline(ulMatch[2], key * 100)}</span>
        </li>
      );
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+[.)]\s+(.+)/);
    if (olMatch) {
      if (listType === 'ul') flushList();
      listType = 'ol';
      const num = listItems.length + 1;
      listItems.push(
        <li key={key++} className="flex gap-2 text-xs leading-relaxed text-text-secondary">
          <span className="text-accent/70 font-semibold tabular-nums shrink-0 w-4 text-right text-[10px] mt-0.5">{num}.</span>
          <span>{parseInline(olMatch[2], key * 100)}</span>
        </li>
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      flushList();
      nodes.push(<div key={key++} className="h-1.5" />);
      continue;
    }

    // Paragraph — render as bullet point when asBullets=true
    flushList();
    if (asBullets) {
      nodes.push(
        <div key={key++} className="flex gap-2 text-xs leading-relaxed text-text-secondary">
          <span className="text-accent/70 mt-0.5 shrink-0 text-[10px]">◆</span>
          <span>{parseInline(line, key * 100)}</span>
        </div>
      );
    } else {
      nodes.push(
        <p key={key++} className="text-xs leading-relaxed text-text-secondary">
          {parseInline(line, key * 100)}
        </p>
      );
    }
  }

  flushList();

  return <div className={`space-y-0.5 ${className}`}>{nodes}</div>;
}
