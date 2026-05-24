import React from 'react';

interface StructuredReadingProps {
  text: string | undefined | null;
  className?: string;
}

type ParsedItem =
  | { type: 'header'; label: string }
  | { type: 'entry'; label: string; value: string }
  | { type: 'paragraph'; text: string };

interface Section {
  title?: string;
  items: Exclude<ParsedItem, { type: 'header' }>[];
}

export function StructuredReading({ text, className = '' }: StructuredReadingProps) {
  if (!text) return null;

  const normalized = String(text)
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '  ');

  const parsed = parse(normalized);
  const sections = group(parsed);
  const hasStructure = parsed.some((p) => p.type === 'entry' || p.type === 'header');

  if (!hasStructure) {
    return (
      <div className={className}>
        {normalized
          .split(/\n\s*\n/)
          .filter((p) => p.trim())
          .map((para, i) => (
            <p key={i} className={`whitespace-pre-line ${i > 0 ? 'mt-2' : ''}`}>
              {stripInlineMarkers(para.trim())}
            </p>
          ))}
      </div>
    );
  }

  return (
    <div className={`space-y-5 ${className}`}>
      {sections.map((section, si) => (
        <div key={si}>
          {section.title && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-accent text-xs">✦</span>
              <h4 className="text-[10px] font-semibold tracking-[0.25em] uppercase text-primary whitespace-nowrap">
                {section.title}
              </h4>
              <span className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
            </div>
          )}
          <div className="space-y-2.5 pl-1">
            {section.items.map((item, ii) =>
              item.type === 'entry' ? (
                <div
                  key={ii}
                  className="flex flex-col sm:flex-row sm:gap-3 gap-0.5 sm:items-baseline"
                >
                  <span className="text-[11px] font-semibold text-accent shrink-0 sm:min-w-[110px]">
                    {item.label}
                  </span>
                  <span className="text-xs leading-relaxed text-text-secondary flex-1">
                    {stripInlineMarkers(item.value)}
                  </span>
                </div>
              ) : (
                <p
                  key={ii}
                  className="text-xs leading-relaxed text-text-secondary whitespace-pre-line"
                >
                  {stripInlineMarkers(item.text)}
                </p>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function parse(text: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  // Match *Label:* or **Label:** followed by value up to the next label or end.
  const regex = /\*{1,2}([^*:\n]{1,80}?):\*{1,2}[ \t]*([\s\S]*?)(?=\n?\*{1,2}[^*:\n]{1,80}?:\*{1,2}|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const pre = text.slice(lastIndex, match.index).trim();
      if (pre) items.push({ type: 'paragraph', text: pre });
    }
    const label = match[1].trim();
    const value = match[2].trim();
    if (!value) {
      items.push({ type: 'header', label });
    } else {
      items.push({ type: 'entry', label, value });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    const tail = text.slice(lastIndex).trim();
    if (tail) items.push({ type: 'paragraph', text: tail });
  }

  return items;
}

function group(items: ParsedItem[]): Section[] {
  const sections: Section[] = [{ items: [] }];
  for (const item of items) {
    if (item.type === 'header') {
      sections.push({ title: item.label, items: [] });
    } else {
      sections[sections.length - 1].items.push(item);
    }
  }
  return sections.filter((s) => s.title || s.items.length > 0);
}

function stripInlineMarkers(text: string): string {
  return text.replace(/\*\*([^*\n]+?)\*\*/g, '$1').replace(/\*([^*\n]+?)\*/g, '$1');
}
